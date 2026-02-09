#!/usr/bin/env bun

/**
 * Recompute SWPPP labor model coefficients from swppp-master.db.
 *
 * This script rebuilds the "rates" model from historical SWPPP B & V rows
 * using non-negative ridge regression with cross-validation.
 */

import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type FeatureName =
  | "install_panels"
  | "relocate_panels"
  | "remove_panels"
  | "install_sock_lf"
  | "relocate_sock_lf"
  | "inlets"
  | "maintenance_flag"
  | "base_setup";

const FEATURE_NAMES: FeatureName[] = [
  "install_panels",
  "relocate_panels",
  "remove_panels",
  "install_sock_lf",
  "relocate_sock_lf",
  "inlets",
  "maintenance_flag",
  "base_setup",
];

const DB_PATH = join(import.meta.dir, "../../../../swppp/swppp-master.db");
const OUTPUT_DIR = join(import.meta.dir, "model-refresh-2026-02-06");
const MAINTENANCE_ACTION_RE =
  /(?:\bfix(?:ed)?\b|\brepair(?:ed)?\b|\bre-?adjust\b|\bstood up\b|\btipped over\b|\bwalked the fence line\b|\bcleanup\b|\bswept\b|\bzip tied\b|\bmissing or damaged\b|\breplace\/clean\b|\bfluffed\b)/i;
const CORE_ACTIVITY_EXCLUSION_RE =
  /(?:\bnarrative\b|\bdelivery\b|\bdeliver(?:ed)?\b|\bspill kit\b|\bfire access sign\b|\bdust sign\b|\bswppp sign\b|\bpermit\b|\binspection(?:s)?\b|\btrip charge\b|\bmobilization\b|\bwater truck\b|\bgorilla snot\b|\bbackflow\b|\bgrate\b|\btank\b|\bpump\b|\blandfill\b|\btrash\b|\bsweep(?:ing|t)?\b|\bpipe\b|\bhydrant\b|\bmeter\b)/i;
const STRICT_PRODUCTION_EXCLUSION_RE =
  /(?:\bnarrative\b|\bdelivery\b|\bdeliver(?:ed)?\b|\bspill kit\b|\bfire access sign\b|\bdust sign\b|\bswppp sign\b|\bpermit\b|\binspection(?:s)?\b|\btrip charge\b|\bmobilization\b|\bwater truck\b|\bgorilla snot\b|\bbackflow\b|\bgrate\b|\btank\b|\bpump\b|\blandfill\b|\btrash\b|\bsweep(?:ing|t)?\b|\bpipe\b|\bhydrant\b|\bmeter\b|\bprivacy screening\b|\bscreening\b|\bsilt fence\b|\bwire backed\b|\brock entrance\b)/i;
const LCG32_MODULUS = 2_147_483_647;
const LCG32_MULTIPLIER = 16_807;

const CURRENT_RATES = {
  install_panels: 12.7,
  relocate_panels: 10.1,
  remove_panels: 4.8,
  install_sock_lf: 0.22,
  relocate_sock_lf: 0.4,
  inlets: 15.6,
  maintenance_flag: 32.1,
  base_setup: 41.4,
} as const;

interface DbRow {
  row_number: number;
  job_name: string | null;
  work_completed: string | null;
}

type FeatureVector = Record<FeatureName, number>;

interface Sample {
  rowNumber: number;
  jobName: string;
  text: string;
  manMinutes: number;
  features: FeatureVector;
}

interface Metrics {
  r2: number;
  medianApe: number;
  p90Ape: number;
}

interface FoldResult extends Metrics {
  fold: number;
  trainCount: number;
  testCount: number;
}

interface TrainResult {
  weights: number[];
  iterations: number;
}

interface ModeledSummary {
  sampleCount: number;
  holdout: {
    trainCount: number;
    testCount: number;
  } & Metrics;
  crossValidation: {
    folds: FoldResult[];
    mean: Metrics;
  };
  finalRates: Record<FeatureName, number>;
  iterations: number;
}

function cleanText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseNum(raw: string): number {
  return Number.parseFloat(raw.replace(/,/g, ""));
}

function sumGroupOne(text: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags);
  let sum = 0;
  let match = re.exec(text);
  while (match !== null) {
    const value = parseNum(match[1] ?? "0");
    if (Number.isFinite(value)) {
      sum += value;
    }
    match = re.exec(text);
  }
  return sum;
}

function parseLaborMinutes(text: string): number {
  // Core pattern: "5 men 2.75 hours" or "3 men 45 minutes"
  const re =
    /(\d+(?:\.\d+)?)\s*men?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/gi;

  let total = 0;
  let match = re.exec(text);
  while (match !== null) {
    const men = parseNum(match[1] ?? "0");
    const duration = parseNum(match[2] ?? "0");
    const unit = (match[3] ?? "").toLowerCase();
    const isHours = unit.startsWith("h");
    const minutes = men * duration * (isHours ? 60 : 1);
    if (Number.isFinite(minutes) && minutes > 0) {
      total += minutes;
    }
    match = re.exec(text);
  }

  return total;
}

function extractFeatures(workCompleted: string): FeatureVector {
  const text = cleanText(workCompleted)
    .replace(/\(they have[^)]*\)/gi, " ")
    .replace(/they have [^.;]*panels? on site/gi, " ")
    .replace(/total sock installed[^.;]*/gi, " ");

  // Panels
  let installPanels = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*(?:new\s*)?panels?\b/gi
  );

  const replaceWithNew =
    /replac(?:e|ed)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*(?:damaged\s*)?panels?[^.;]{0,80}?\bwith\b[^.;]{0,30}?\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*new\s*panels?\b/gi;
  let replaceMatch = replaceWithNew.exec(text);
  while (replaceMatch !== null) {
    const newPanels = parseNum(replaceMatch[2] ?? "0");
    if (Number.isFinite(newPanels) && newPanels > 0) {
      installPanels += newPanels;
    }
    replaceMatch = replaceWithNew.exec(text);
  }

  const relocatePanels = sumGroupOne(
    text,
    /relocat(?:e|ed)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*panels?\b/gi
  );

  let removePanels = sumGroupOne(
    text,
    /(?:remove(?:d)?|picked\s*up)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*panels?\b/gi
  );
  removePanels += sumGroupOne(
    text,
    /stockpiled?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*panels?\b/gi
  );

  // Sock LF
  const installSockLf = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,40}?\bsock\b/gi
  );

  const relocateSockLf = sumGroupOne(
    text,
    /relocat(?:e|ed)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,40}?\bsock\b/gi
  );

  // Inlets (usually "Protected (N) drop/curb inlets")
  const inlets = sumGroupOne(
    text,
    /protect(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?[^.;]{0,30}\binlets?\b/gi
  );

  const maintenanceFlag = MAINTENANCE_ACTION_RE.test(text) ? 1 : 0;

  return {
    install_panels: installPanels,
    relocate_panels: relocatePanels,
    remove_panels: removePanels,
    install_sock_lf: installSockLf,
    relocate_sock_lf: relocateSockLf,
    inlets,
    maintenance_flag: maintenanceFlag,
    base_setup: 1,
  };
}

function featureSignal(features: FeatureVector): number {
  return (
    features.install_panels +
    features.relocate_panels +
    features.remove_panels +
    features.install_sock_lf +
    features.relocate_sock_lf +
    features.inlets +
    features.maintenance_flag
  );
}

function isCoreActivityText(rawText: string): boolean {
  const text = cleanText(rawText);
  // Exclude non-production or mixed admin/service rows that inflate intercepts.
  return !CORE_ACTIVITY_EXCLUSION_RE.test(text);
}

function isStrictProductionSample(sample: Sample): boolean {
  const text = cleanText(sample.text);
  const hasPrimarySignal =
    sample.features.install_panels > 0 ||
    sample.features.relocate_panels > 0 ||
    sample.features.remove_panels > 0 ||
    sample.features.install_sock_lf > 0 ||
    sample.features.relocate_sock_lf > 0 ||
    sample.features.inlets > 0;

  if (!hasPrimarySignal) {
    return false;
  }

  // Keep rows focused on panel/sock/inlet operations.
  return !STRICT_PRODUCTION_EXCLUSION_RE.test(text);
}

function lcg32(seed: number): () => number {
  let s = Math.trunc(Math.abs(seed)) % LCG32_MODULUS;
  if (s === 0) {
    s = 1;
  }
  return () => {
    s = (s * LCG32_MULTIPLIER) % LCG32_MODULUS;
    return s / LCG32_MODULUS;
  };
}

function shuffleDeterministic<T>(items: T[], seed = 42): T[] {
  const out = [...items];
  const rand = lcg32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j] as T;
    out[j] = tmp as T;
  }
  return out;
}

function trainNonNegativeRidge(
  samples: Sample[],
  lambda = 0.1,
  maxIterations = 3000,
  tolerance = 1e-6
): TrainResult {
  const n = samples.length;
  const m = FEATURE_NAMES.length;
  const x = samples.map((s) => FEATURE_NAMES.map((name) => s.features[name]));
  const y = samples.map((s) => s.manMinutes);

  const weights = new Array<number>(m).fill(0);
  const preds = new Array<number>(n).fill(0);

  let iterations = 0;
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let maxDelta = 0;

    for (let j = 0; j < m; j++) {
      let numer = 0;
      let denom = lambda;

      for (let i = 0; i < n; i++) {
        const xij = x[i]?.[j] ?? 0;
        if (xij === 0) {
          continue;
        }
        const residual = y[i] - preds[i] + weights[j] * xij;
        numer += xij * residual;
        denom += xij * xij;
      }

      const next = Math.max(0, numer / denom);
      const delta = next - weights[j];
      if (delta !== 0) {
        for (let i = 0; i < n; i++) {
          const xij = x[i]?.[j] ?? 0;
          if (xij !== 0) {
            preds[i] += delta * xij;
          }
        }
      }

      const absDelta = Math.abs(delta);
      if (absDelta > maxDelta) {
        maxDelta = absDelta;
      }
      weights[j] = next;
    }

    if (maxDelta < tolerance) {
      break;
    }
  }

  return { weights, iterations };
}

function predict(weights: number[], sample: Sample): number {
  let total = 0;
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    const featureName = FEATURE_NAMES[i] as FeatureName;
    total += (weights[i] ?? 0) * sample.features[featureName];
  }
  return total;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, p * (sorted.length - 1)));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return sorted[lo] ?? 0;
  }
  const t = idx - lo;
  const low = sorted[lo] ?? 0;
  const high = sorted[hi] ?? 0;
  return low * (1 - t) + high * t;
}

function evaluate(samples: Sample[], weights: number[]): Metrics {
  const actual = samples.map((s) => s.manMinutes);
  const predicted = samples.map((s) => predict(weights, s));
  const mean = actual.reduce((sum, v) => sum + v, 0) / (actual.length || 1);

  let sse = 0;
  let sst = 0;
  const ape: number[] = [];

  for (let i = 0; i < actual.length; i++) {
    const y = actual[i] ?? 0;
    const yhat = predicted[i] ?? 0;
    const err = y - yhat;
    sse += err * err;
    const centered = y - mean;
    sst += centered * centered;
    if (y > 0) {
      ape.push(Math.abs(err) / y);
    }
  }

  return {
    r2: sst > 0 ? 1 - sse / sst : 0,
    medianApe: percentile(ape, 0.5),
    p90Ape: percentile(ape, 0.9),
  };
}

function crossValidate(
  allSamples: Sample[],
  k = 5
): { folds: FoldResult[]; mean: Metrics } {
  const shuffled = shuffleDeterministic(allSamples, 1337);
  const n = shuffled.length;
  const foldSize = Math.floor(n / k);
  const folds: FoldResult[] = [];

  for (let fold = 0; fold < k; fold++) {
    const start = fold * foldSize;
    const end = fold === k - 1 ? n : start + foldSize;
    const test = shuffled.slice(start, end);
    const train = [...shuffled.slice(0, start), ...shuffled.slice(end)];

    const model = trainNonNegativeRidge(train);
    const metrics = evaluate(test, model.weights);

    folds.push({
      fold: fold + 1,
      trainCount: train.length,
      testCount: test.length,
      ...metrics,
    });
  }

  const mean = {
    r2: folds.reduce((s, f) => s + f.r2, 0) / folds.length,
    medianApe: folds.reduce((s, f) => s + f.medianApe, 0) / folds.length,
    p90Ape: folds.reduce((s, f) => s + f.p90Ape, 0) / folds.length,
  };

  return { folds, mean };
}

function runModel(samples: Sample[]): ModeledSummary {
  const shuffled = shuffleDeterministic(samples, 20_260_206);
  const split = Math.floor(shuffled.length * 0.8);
  const train = shuffled.slice(0, split);
  const test = shuffled.slice(split);

  const holdoutModel = trainNonNegativeRidge(train);
  const holdout = evaluate(test, holdoutModel.weights);
  const cv = crossValidate(samples, 5);
  const finalModel = trainNonNegativeRidge(samples);

  const finalRates = FEATURE_NAMES.reduce<Record<FeatureName, number>>(
    (acc, name, idx) => {
      acc[name] = finalModel.weights[idx] ?? 0;
      return acc;
    },
    {} as Record<FeatureName, number>
  );

  return {
    sampleCount: samples.length,
    holdout: {
      trainCount: train.length,
      testCount: test.length,
      ...holdout,
    },
    crossValidation: cv,
    finalRates,
    iterations: finalModel.iterations,
  };
}

function main(): void {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .query<DbRow, []>(
      `
      SELECT row_number, job_name, work_completed
      FROM projects
      WHERE worksheet = 'SWPPP B & V'
        AND work_completed IS NOT NULL
        AND trim(work_completed) <> ''
      ORDER BY row_number
    `
    )
    .all();

  const allWithLabor: Sample[] = [];
  const modeledSamples: Sample[] = [];

  for (const row of rows) {
    const workCompleted = row.work_completed ?? "";
    const manMinutes = parseLaborMinutes(workCompleted);
    if (manMinutes <= 0) {
      continue;
    }

    const features = extractFeatures(workCompleted);
    const sample: Sample = {
      rowNumber: row.row_number,
      jobName: row.job_name ?? "",
      text: workCompleted,
      manMinutes,
      features,
    };
    allWithLabor.push(sample);

    if (featureSignal(features) > 0) {
      modeledSamples.push(sample);
    }
  }

  const shuffled = shuffleDeterministic(modeledSamples, 20_260_206);
  const coreSamples = modeledSamples.filter((s) => isCoreActivityText(s.text));
  const strictSamples = modeledSamples.filter((s) =>
    isStrictProductionSample(s)
  );

  const allSignalModel = runModel(shuffled);
  const coreModel = runModel(coreSamples);
  const strictModel = runModel(strictSamples);

  const featureCoverage = FEATURE_NAMES.reduce<Record<FeatureName, number>>(
    (acc, name) => {
      acc[name] = modeledSamples.filter((s) => s.features[name] > 0).length;
      return acc;
    },
    {} as Record<FeatureName, number>
  );

  const result = {
    generatedAt: new Date().toISOString(),
    source: DB_PATH,
    sampleCounts: {
      rowsWithCompletedText: rows.length,
      rowsWithParsedLabor: allWithLabor.length,
      modeledSamples: modeledSamples.length,
      droppedForNoSignal: allWithLabor.length - modeledSamples.length,
      coreSamples: coreSamples.length,
      strictSamples: strictSamples.length,
    },
    featureCoverage,
    modelAllSignal: allSignalModel,
    modelCoreOnly: coreModel,
    modelStrictProduction: strictModel,
    previousRates: CURRENT_RATES,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, "swppp-model-refresh-latest.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log("SWPPP Labor Model Refresh");
  console.log("=========================\n");
  console.log(`Rows with completed text: ${rows.length}`);
  console.log(`Rows with parsed labor: ${allWithLabor.length}`);
  console.log(`Modeled samples (all signal): ${modeledSamples.length}`);
  console.log(`Modeled samples (core-only): ${coreSamples.length}`);
  console.log(`Modeled samples (strict production): ${strictSamples.length}`);
  console.log(
    `Dropped (labor but no modeled signal): ${allWithLabor.length - modeledSamples.length}\n`
  );

  console.log("Cross-validation (all-signal, 5-fold):");
  console.log(`  Mean R²: ${pct(allSignalModel.crossValidation.mean.r2)}`);
  console.log(
    `  Mean median APE: ${pct(allSignalModel.crossValidation.mean.medianApe)}`
  );
  console.log(
    `  Mean p90 APE: ${pct(allSignalModel.crossValidation.mean.p90Ape)}\n`
  );

  console.log("Cross-validation (core-only, 5-fold):");
  console.log(`  Mean R²: ${pct(coreModel.crossValidation.mean.r2)}`);
  console.log(
    `  Mean median APE: ${pct(coreModel.crossValidation.mean.medianApe)}`
  );
  console.log(
    `  Mean p90 APE: ${pct(coreModel.crossValidation.mean.p90Ape)}\n`
  );

  console.log("Cross-validation (strict production, 5-fold):");
  console.log(`  Mean R²: ${pct(strictModel.crossValidation.mean.r2)}`);
  console.log(
    `  Mean median APE: ${pct(strictModel.crossValidation.mean.medianApe)}`
  );
  console.log(
    `  Mean p90 APE: ${pct(strictModel.crossValidation.mean.p90Ape)}\n`
  );

  console.log("Recomputed rates (strict production model, man-minutes):");
  for (const name of FEATURE_NAMES) {
    const next = strictModel.finalRates[name];
    const prev = CURRENT_RATES[name];
    const deltaPct = prev > 0 ? ((next - prev) / prev) * 100 : 0;
    const sign = deltaPct >= 0 ? "+" : "";
    console.log(
      `  ${name.padEnd(16)} ${next.toFixed(3).padStart(8)}   (prev ${prev.toFixed(
        3
      )}, ${sign}${deltaPct.toFixed(1)}%)`
    );
  }

  console.log(`\nWrote: ${outPath}`);
}

if (import.meta.main) {
  main();
}

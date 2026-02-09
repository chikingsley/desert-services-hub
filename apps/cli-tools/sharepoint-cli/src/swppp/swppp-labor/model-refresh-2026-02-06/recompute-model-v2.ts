#!/usr/bin/env bun

/**
 * SWPPP labor model refresh (v2 extractor).
 *
 * Adds operational categories discussed with SWPPP ops:
 * - temp fence + privacy screening
 * - silt fence separate from sock
 * - rock entrance + rumble grate
 * - signs/stickers/narrative/delivery/admin flags
 */

import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = join(import.meta.dir, "../../../../../swppp/swppp-master.db");
const OUTPUT_DIR = import.meta.dir;

type LegacyFeature =
  | "install_panels"
  | "relocate_panels"
  | "remove_panels"
  | "install_sock_lf"
  | "relocate_sock_lf"
  | "inlets"
  | "maintenance_flag"
  | "base_setup";

const LEGACY_FEATURES: LegacyFeature[] = [
  "install_panels",
  "relocate_panels",
  "remove_panels",
  "install_sock_lf",
  "relocate_sock_lf",
  "inlets",
  "maintenance_flag",
  "base_setup",
];

type ExpandedFeature =
  | LegacyFeature
  | "install_silt_fence_lf"
  | "install_privacy_screen_lf"
  | "rock_entrance_count"
  | "rumble_grate_count"
  | "trackout_rock_tons"
  | "signs_count"
  | "stickers_count"
  | "narrative_count"
  | "delivery_flag"
  | "trip_charge_count"
  | "mobilization_count";

const EXPANDED_FEATURES: ExpandedFeature[] = [
  "install_panels",
  "relocate_panels",
  "remove_panels",
  "install_sock_lf",
  "relocate_sock_lf",
  "inlets",
  "install_silt_fence_lf",
  "install_privacy_screen_lf",
  "rock_entrance_count",
  "rumble_grate_count",
  "trackout_rock_tons",
  "signs_count",
  "stickers_count",
  "narrative_count",
  "delivery_flag",
  "trip_charge_count",
  "mobilization_count",
  "maintenance_flag",
  "base_setup",
];

const PROD_FEATURES: ExpandedFeature[] = [
  "install_panels",
  "relocate_panels",
  "remove_panels",
  "install_sock_lf",
  "relocate_sock_lf",
  "install_silt_fence_lf",
  "install_privacy_screen_lf",
  "inlets",
  "rock_entrance_count",
  "rumble_grate_count",
  "trackout_rock_tons",
  "maintenance_flag",
  "base_setup",
];

const ADMIN_FEATURES: ExpandedFeature[] = [
  "narrative_count",
  "signs_count",
  "stickers_count",
  "delivery_flag",
  "trip_charge_count",
  "mobilization_count",
  "maintenance_flag",
  "base_setup",
];

type FeatureMap = Record<string, number>;

interface DbRow {
  row_number: number;
  job_name: string | null;
  work_completed: string | null;
}

interface Sample {
  rowNumber: number;
  jobName: string;
  text: string;
  manMinutes: number;
  legacy: Record<LegacyFeature, number>;
  expanded: Record<ExpandedFeature, number>;
}

interface Metrics {
  r2: number;
  medianApe: number;
  p90Ape: number;
}

interface FoldMetrics extends Metrics {
  fold: number;
  trainCount: number;
  testCount: number;
}

interface ModelSummary {
  sampleCount: number;
  holdout: Metrics & { trainCount: number; testCount: number };
  crossValidation: { folds: FoldMetrics[]; mean: Metrics };
  coefficients: FeatureMap;
}

interface SegmentedSummary {
  sampleCount: number;
  productionSampleCount: number;
  adminSampleCount: number;
  holdout: Metrics & { trainCount: number; testCount: number };
  crossValidation: { folds: FoldMetrics[]; mean: Metrics };
  productionCoefficients: FeatureMap;
  adminCoefficients: FeatureMap;
}

const MAINTENANCE_ACTION_RE =
  /(?:\bfix(?:ed)?\b|\brepair(?:ed)?\b|\bre-?adjust\b|\bstood up\b|\btipped over\b|\bwalked the fence line\b|\bcleanup\b|\bswept\b|\bzip tied\b|\bmissing or damaged\b|\breplace\/clean\b|\bfluffed\b)/i;
const STICKER_RE = /\bsticker\b/i;
const NARRATIVE_RE = /\bnarrative\b/i;
const DELIVERY_RE = /\b(deliver(?:ed|y)?|pick(?:ed)? up)\b/i;
const TRIP_CHARGE_RE = /\btrip charge\b/i;
const MOBILIZATION_RE = /\bmobilization\b/i;
const LCG32_MODULUS = 2_147_483_647;
const LCG32_MULTIPLIER = 16_807;

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
    const n = parseNum(match[1] ?? "0");
    if (Number.isFinite(n)) {
      sum += n;
    }
    match = re.exec(text);
  }
  return sum;
}

function countMatches(text: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags);
  let c = 0;
  let match = re.exec(text);
  while (match !== null) {
    c++;
    match = re.exec(text);
  }
  return c;
}

function parseLaborMinutes(text: string): number {
  const re =
    /(\d+(?:\.\d+)?)\s*men?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/gi;
  let total = 0;
  let match = re.exec(text);
  while (match !== null) {
    const men = parseNum(match[1] ?? "0");
    const duration = parseNum(match[2] ?? "0");
    const unit = (match[3] ?? "").toLowerCase();
    const minutes = men * duration * (unit.startsWith("h") ? 60 : 1);
    if (Number.isFinite(minutes) && minutes > 0) {
      total += minutes;
    }
    match = re.exec(text);
  }
  return total;
}

function baseNormalizedText(raw: string): string {
  return cleanText(raw)
    .replace(/\(they have[^)]*\)/gi, " ")
    .replace(/they have [^.;]*panels? on site/gi, " ")
    .replace(/total sock installed[^.;]*/gi, " ");
}

function extractLegacyFeatures(raw: string): Record<LegacyFeature, number> {
  const text = baseNormalizedText(raw);

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

  const installSockLf = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,40}?\bsock\b/gi
  );

  const relocateSockLf = sumGroupOne(
    text,
    /relocat(?:e|ed)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,40}?\bsock\b/gi
  );

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

function extractExpandedFeatures(raw: string): Record<ExpandedFeature, number> {
  const text = baseNormalizedText(raw);
  const legacy = extractLegacyFeatures(raw);

  const installSiltFenceLf = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,80}?(?:silt fence|wire backed silt fence|down and dirty silt fence)\b/gi
  );

  const installPrivacyScreenLf = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,80}?(?:privacy screening|screening)\b/gi
  );

  let rockEntranceCount = sumGroupOne(
    text,
    /rock entrance\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?/gi
  );
  if (rockEntranceCount === 0) {
    rockEntranceCount = countMatches(
      text,
      /install(?:ed)?[^.;]{0,70}\brock entrance\b/gi
    );
  }

  const rumbleGrateCountFromQty = sumGroupOne(
    text,
    /(?:install(?:ed)?|replace(?:d)?|pick(?:ed)? up)[^.;]{0,50}\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*grates?\b/gi
  );
  const rumbleGrateCount =
    rumbleGrateCountFromQty > 0
      ? rumbleGrateCountFromQty
      : countMatches(text, /\bgrates?\b/gi);

  const trackoutRockTons = sumGroupOne(
    text,
    /(\d[\d,]*(?:\.\d+)?)\s*tons?\s+of\s+track\s*out\s+rock/gi
  );

  const signQty = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?[^.;]{0,80}\bsigns?\b/gi
  );
  const signMentions = countMatches(
    text,
    /install(?:ed)?[^.;]{0,80}\bsigns?\b/gi
  );
  const signsCount = signQty > 0 ? signQty : signMentions;

  const stickerQty = sumGroupOne(
    text,
    /(?:install(?:ed)?|replace(?:d)?)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?[^.;]{0,80}\bstickers?\b/gi
  );
  let stickersCount = stickerQty;
  if (stickerQty <= 0 && STICKER_RE.test(text)) {
    stickersCount = 1;
  }

  const narrativeCount = NARRATIVE_RE.test(text) ? 1 : 0;
  const deliveryFlag = DELIVERY_RE.test(text) ? 1 : 0;

  const tripChargeQty = sumGroupOne(
    text,
    /trip charge\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?/gi
  );
  let tripChargeCount = tripChargeQty;
  if (tripChargeQty <= 0 && TRIP_CHARGE_RE.test(text)) {
    tripChargeCount = 1;
  }

  const mobilizationQty = sumGroupOne(
    text,
    /mobilization(?: charge)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?/gi
  );
  let mobilizationCount = mobilizationQty;
  if (mobilizationQty <= 0 && MOBILIZATION_RE.test(text)) {
    mobilizationCount = 1;
  }

  return {
    ...legacy,
    install_silt_fence_lf: installSiltFenceLf,
    install_privacy_screen_lf: installPrivacyScreenLf,
    rock_entrance_count: rockEntranceCount,
    rumble_grate_count: rumbleGrateCount,
    trackout_rock_tons: trackoutRockTons,
    signs_count: signsCount,
    stickers_count: stickersCount,
    narrative_count: narrativeCount,
    delivery_flag: deliveryFlag,
    trip_charge_count: tripChargeCount,
    mobilization_count: mobilizationCount,
  };
}

function featureSignal(map: FeatureMap): number {
  return Object.entries(map)
    .filter(([name]) => name !== "base_setup")
    .reduce((sum, [, value]) => sum + value, 0);
}

function isProductionSample(sample: Sample): boolean {
  const f = sample.expanded;
  const signal =
    f.install_panels +
    f.relocate_panels +
    f.remove_panels +
    f.install_sock_lf +
    f.relocate_sock_lf +
    f.install_silt_fence_lf +
    f.install_privacy_screen_lf +
    f.inlets +
    f.rock_entrance_count +
    f.rumble_grate_count +
    f.trackout_rock_tons;
  return signal > 0;
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

function shuffle<T>(items: T[], seed: number): T[] {
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
  x: number[][],
  y: number[],
  lambda = 0.1,
  maxIterations = 3000,
  tolerance = 1e-6
): number[] {
  const n = x.length;
  const m = x[0]?.length ?? 0;
  const w = new Array<number>(m).fill(0);
  const preds = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxDelta = 0;
    for (let j = 0; j < m; j++) {
      let numer = 0;
      let denom = lambda;
      for (let i = 0; i < n; i++) {
        const xij = x[i]?.[j] ?? 0;
        if (xij === 0) {
          continue;
        }
        numer += xij * (y[i] - preds[i] + w[j] * xij);
        denom += xij * xij;
      }
      const next = Math.max(0, numer / denom);
      const delta = next - w[j];
      if (delta !== 0) {
        for (let i = 0; i < n; i++) {
          const xij = x[i]?.[j] ?? 0;
          if (xij !== 0) {
            preds[i] += delta * xij;
          }
        }
      }
      w[j] = next;
      maxDelta = Math.max(maxDelta, Math.abs(delta));
    }
    if (maxDelta < tolerance) {
      break;
    }
  }

  return w;
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

function evaluate(x: number[][], y: number[], w: number[]): Metrics {
  const preds = x.map((row) =>
    row.reduce((sum, v, idx) => sum + v * (w[idx] ?? 0), 0)
  );
  const mean = y.reduce((s, v) => s + v, 0) / (y.length || 1);
  let sse = 0;
  let sst = 0;
  const ape: number[] = [];

  for (let i = 0; i < y.length; i++) {
    const yi = y[i] ?? 0;
    const err = yi - (preds[i] ?? 0);
    sse += err * err;
    sst += (yi - mean) * (yi - mean);
    if (yi > 0) {
      ape.push(Math.abs(err) / yi);
    }
  }

  return {
    r2: sst > 0 ? 1 - sse / sst : 0,
    medianApe: percentile(ape, 0.5),
    p90Ape: percentile(ape, 0.9),
  };
}

function evaluatePredictions(actual: number[], predicted: number[]): Metrics {
  const mean = actual.reduce((s, v) => s + v, 0) / (actual.length || 1);
  let sse = 0;
  let sst = 0;
  const ape: number[] = [];
  for (let i = 0; i < actual.length; i++) {
    const yi = actual[i] ?? 0;
    const yhat = predicted[i] ?? 0;
    const err = yi - yhat;
    sse += err * err;
    sst += (yi - mean) * (yi - mean);
    if (yi > 0) {
      ape.push(Math.abs(err) / yi);
    }
  }
  return {
    r2: sst > 0 ? 1 - sse / sst : 0,
    medianApe: percentile(ape, 0.5),
    p90Ape: percentile(ape, 0.9),
  };
}

function buildXY(
  samples: Sample[],
  featureNames: ExpandedFeature[]
): { x: number[][]; y: number[] } {
  return {
    x: samples.map((s) => featureNames.map((f) => s.expanded[f] ?? 0)),
    y: samples.map((s) => s.manMinutes),
  };
}

function predictOne(
  sample: Sample,
  featureNames: ExpandedFeature[],
  w: number[]
): number {
  let sum = 0;
  for (let i = 0; i < featureNames.length; i++) {
    sum +=
      (sample.expanded[featureNames[i] ?? "base_setup"] ?? 0) * (w[i] ?? 0);
  }
  return sum;
}

function runModel(
  samples: Sample[],
  featureNames: string[],
  selector: (s: Sample) => FeatureMap
): ModelSummary {
  const rows = shuffle(samples, 20_260_206);
  const split = Math.floor(rows.length * 0.8);
  const train = rows.slice(0, split);
  const test = rows.slice(split);

  const xTrain = train.map((s) => featureNames.map((f) => selector(s)[f] ?? 0));
  const yTrain = train.map((s) => s.manMinutes);
  const xTest = test.map((s) => featureNames.map((f) => selector(s)[f] ?? 0));
  const yTest = test.map((s) => s.manMinutes);

  const holdoutWeights = trainNonNegativeRidge(xTrain, yTrain);
  const holdoutMetrics = evaluate(xTest, yTest, holdoutWeights);

  const shuffled = shuffle(samples, 1337);
  const k = 5;
  const foldSize = Math.floor(shuffled.length / k);
  const folds: FoldMetrics[] = [];
  for (let fold = 0; fold < k; fold++) {
    const start = fold * foldSize;
    const end = fold === k - 1 ? shuffled.length : start + foldSize;
    const foldTest = shuffled.slice(start, end);
    const foldTrain = [...shuffled.slice(0, start), ...shuffled.slice(end)];
    const xTr = foldTrain.map((s) =>
      featureNames.map((f) => selector(s)[f] ?? 0)
    );
    const yTr = foldTrain.map((s) => s.manMinutes);
    const xTe = foldTest.map((s) =>
      featureNames.map((f) => selector(s)[f] ?? 0)
    );
    const yTe = foldTest.map((s) => s.manMinutes);
    const w = trainNonNegativeRidge(xTr, yTr);
    const m = evaluate(xTe, yTe, w);
    folds.push({
      fold: fold + 1,
      trainCount: foldTrain.length,
      testCount: foldTest.length,
      ...m,
    });
  }
  const mean: Metrics = {
    r2: folds.reduce((s, f) => s + f.r2, 0) / folds.length,
    medianApe: folds.reduce((s, f) => s + f.medianApe, 0) / folds.length,
    p90Ape: folds.reduce((s, f) => s + f.p90Ape, 0) / folds.length,
  };

  const xAll = samples.map((s) => featureNames.map((f) => selector(s)[f] ?? 0));
  const yAll = samples.map((s) => s.manMinutes);
  const wAll = trainNonNegativeRidge(xAll, yAll);

  const coefficients: FeatureMap = {};
  for (let i = 0; i < featureNames.length; i++) {
    coefficients[featureNames[i] ?? `f${i}`] = wAll[i] ?? 0;
  }

  return {
    sampleCount: samples.length,
    holdout: {
      trainCount: train.length,
      testCount: test.length,
      ...holdoutMetrics,
    },
    crossValidation: { folds, mean },
    coefficients,
  };
}

function runSegmentedModel(samples: Sample[]): SegmentedSummary {
  const rows = shuffle(samples, 20_260_206);
  const split = Math.floor(rows.length * 0.8);
  const train = rows.slice(0, split);
  const test = rows.slice(split);

  const trainProd = train.filter((s) => isProductionSample(s));
  const trainAdmin = train.filter((s) => !isProductionSample(s));
  const trainProdXY = buildXY(trainProd, PROD_FEATURES);
  const trainAdminXY = buildXY(trainAdmin, ADMIN_FEATURES);

  const trainProdW =
    trainProdXY.x.length > 0
      ? trainNonNegativeRidge(trainProdXY.x, trainProdXY.y)
      : new Array<number>(PROD_FEATURES.length).fill(0);
  const trainAdminW =
    trainAdminXY.x.length > 0
      ? trainNonNegativeRidge(trainAdminXY.x, trainAdminXY.y)
      : new Array<number>(ADMIN_FEATURES.length).fill(0);

  const fallbackTrain =
    train.reduce((s, v) => s + v.manMinutes, 0) / (train.length || 1);
  const holdoutPred = test.map((s) => {
    const yhat = isProductionSample(s)
      ? predictOne(s, PROD_FEATURES, trainProdW)
      : predictOne(s, ADMIN_FEATURES, trainAdminW);
    return Number.isFinite(yhat) && yhat > 0 ? yhat : fallbackTrain;
  });
  const holdoutActual = test.map((s) => s.manMinutes);
  const holdoutMetrics = evaluatePredictions(holdoutActual, holdoutPred);

  const k = 5;
  const shuffled = shuffle(samples, 1337);
  const foldSize = Math.floor(shuffled.length / k);
  const folds: FoldMetrics[] = [];
  for (let fold = 0; fold < k; fold++) {
    const start = fold * foldSize;
    const end = fold === k - 1 ? shuffled.length : start + foldSize;
    const foldTest = shuffled.slice(start, end);
    const foldTrain = [...shuffled.slice(0, start), ...shuffled.slice(end)];

    const prodTrain = foldTrain.filter((s) => isProductionSample(s));
    const adminTrain = foldTrain.filter((s) => !isProductionSample(s));
    const prodXY = buildXY(prodTrain, PROD_FEATURES);
    const adminXY = buildXY(adminTrain, ADMIN_FEATURES);
    const prodW =
      prodXY.x.length > 0
        ? trainNonNegativeRidge(prodXY.x, prodXY.y)
        : new Array<number>(PROD_FEATURES.length).fill(0);
    const adminW =
      adminXY.x.length > 0
        ? trainNonNegativeRidge(adminXY.x, adminXY.y)
        : new Array<number>(ADMIN_FEATURES.length).fill(0);

    const fallback =
      foldTrain.reduce((s, v) => s + v.manMinutes, 0) / (foldTrain.length || 1);
    const pred = foldTest.map((s) => {
      const yhat = isProductionSample(s)
        ? predictOne(s, PROD_FEATURES, prodW)
        : predictOne(s, ADMIN_FEATURES, adminW);
      return Number.isFinite(yhat) && yhat > 0 ? yhat : fallback;
    });
    const actual = foldTest.map((s) => s.manMinutes);
    const metrics = evaluatePredictions(actual, pred);
    folds.push({
      fold: fold + 1,
      trainCount: foldTrain.length,
      testCount: foldTest.length,
      ...metrics,
    });
  }

  const mean: Metrics = {
    r2: folds.reduce((s, f) => s + f.r2, 0) / folds.length,
    medianApe: folds.reduce((s, f) => s + f.medianApe, 0) / folds.length,
    p90Ape: folds.reduce((s, f) => s + f.p90Ape, 0) / folds.length,
  };

  const allProd = samples.filter((s) => isProductionSample(s));
  const allAdmin = samples.filter((s) => !isProductionSample(s));
  const allProdXY = buildXY(allProd, PROD_FEATURES);
  const allAdminXY = buildXY(allAdmin, ADMIN_FEATURES);
  const allProdW =
    allProdXY.x.length > 0
      ? trainNonNegativeRidge(allProdXY.x, allProdXY.y)
      : new Array<number>(PROD_FEATURES.length).fill(0);
  const allAdminW =
    allAdminXY.x.length > 0
      ? trainNonNegativeRidge(allAdminXY.x, allAdminXY.y)
      : new Array<number>(ADMIN_FEATURES.length).fill(0);

  const productionCoefficients: FeatureMap = {};
  for (let i = 0; i < PROD_FEATURES.length; i++) {
    productionCoefficients[PROD_FEATURES[i] ?? `prod_${i}`] = allProdW[i] ?? 0;
  }
  const adminCoefficients: FeatureMap = {};
  for (let i = 0; i < ADMIN_FEATURES.length; i++) {
    adminCoefficients[ADMIN_FEATURES[i] ?? `admin_${i}`] = allAdminW[i] ?? 0;
  }

  return {
    sampleCount: samples.length,
    productionSampleCount: allProd.length,
    adminSampleCount: allAdmin.length,
    holdout: {
      trainCount: train.length,
      testCount: test.length,
      ...holdoutMetrics,
    },
    crossValidation: { folds, mean },
    productionCoefficients,
    adminCoefficients,
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

  const samples: Sample[] = [];
  for (const row of rows) {
    const text = row.work_completed ?? "";
    const manMinutes = parseLaborMinutes(text);
    if (manMinutes <= 0) {
      continue;
    }
    const legacy = extractLegacyFeatures(text);
    const expanded = extractExpandedFeatures(text);
    samples.push({
      rowNumber: row.row_number,
      jobName: row.job_name ?? "",
      text,
      manMinutes,
      legacy,
      expanded,
    });
  }

  const legacySamples = samples.filter((s) => featureSignal(s.legacy) > 0);
  const expandedSamples = samples.filter((s) => featureSignal(s.expanded) > 0);

  const legacyModel = runModel(
    legacySamples,
    LEGACY_FEATURES,
    (s) => s.legacy as FeatureMap
  );
  const expandedModel = runModel(
    expandedSamples,
    EXPANDED_FEATURES,
    (s) => s.expanded as FeatureMap
  );
  const segmentedModel = runSegmentedModel(expandedSamples);

  const result = {
    generatedAt: new Date().toISOString(),
    source: DB_PATH,
    sampleCounts: {
      rowsWithCompletedText: rows.length,
      rowsWithParsedLabor: samples.length,
      legacySignalSamples: legacySamples.length,
      expandedSignalSamples: expandedSamples.length,
      segmentedProductionSamples: segmentedModel.productionSampleCount,
      segmentedAdminSamples: segmentedModel.adminSampleCount,
    },
    legacyModel,
    expandedModel,
    segmentedModel,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, "swppp-model-refresh-v2.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log("SWPPP Labor Model Refresh V2");
  console.log("============================\n");
  console.log(`Rows with parsed labor: ${samples.length}`);
  console.log(`Legacy signal samples: ${legacySamples.length}`);
  console.log(`Expanded signal samples: ${expandedSamples.length}\n`);
  console.log("Legacy model (5-fold CV mean):");
  console.log(`  R²: ${pct(legacyModel.crossValidation.mean.r2)}`);
  console.log(
    `  Median APE: ${pct(legacyModel.crossValidation.mean.medianApe)}`
  );
  console.log(`  P90 APE: ${pct(legacyModel.crossValidation.mean.p90Ape)}\n`);
  console.log("Expanded model (5-fold CV mean):");
  console.log(`  R²: ${pct(expandedModel.crossValidation.mean.r2)}`);
  console.log(
    `  Median APE: ${pct(expandedModel.crossValidation.mean.medianApe)}`
  );
  console.log(`  P90 APE: ${pct(expandedModel.crossValidation.mean.p90Ape)}\n`);
  console.log("Segmented model (5-fold CV mean):");
  console.log(`  R²: ${pct(segmentedModel.crossValidation.mean.r2)}`);
  console.log(
    `  Median APE: ${pct(segmentedModel.crossValidation.mean.medianApe)}`
  );
  console.log(
    `  P90 APE: ${pct(segmentedModel.crossValidation.mean.p90Ape)}\n`
  );
  console.log(`Wrote: ${outPath}`);
}

if (import.meta.main) {
  main();
}

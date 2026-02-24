/**
 * Page 4 State Verification Index
 *
 * Exports all category state verification functions and types
 * Organized by category for easy cross-referencing with fill functions
 */

import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { Page4State } from "@/form-data";
import { selectors } from "@/portal/utils/selectors";

export type { CategoryAState } from "./category-a";
export { getCategoryAState } from "./category-a";
export type { CategoryB1State, CategoryB2State } from "./category-b";
export { getCategoryBState } from "./category-b";
export type {
  CategoryC1State,
  CategoryC2State,
  CategoryC3State,
  CategoryC4State,
} from "./category-c";
export { getCategoryCState } from "./category-c";
export type {
  CategoryD1State,
  CategoryD2State,
  CategoryD3State,
  CategoryD4State,
  CategoryD5State,
} from "./category-d";
export { getCategoryDState } from "./category-d";
export type { CategoryE1State, CategoryE2State } from "./category-e";
export { getCategoryEState } from "./category-e";
export type { CategoryF1State, CategoryF2State } from "./category-f";
export { getCategoryFState } from "./category-f";
export type { CategoryG1State, CategoryG2State } from "./category-g";
export { getCategoryGState } from "./category-g";
export type { CategoryHState } from "./category-h";
export { getCategoryHState } from "./category-h";
export type { CategoryI1State, CategoryI2State } from "./category-i";
export { getCategoryIState } from "./category-i";
export type { CategoryJState } from "./category-j";
export { getCategoryJState } from "./category-j";
export type { CategoryKState } from "./category-k";
export { getCategoryKState } from "./category-k";
export type { PostKState } from "./category-post-k";
export { getPostKState } from "./category-post-k";
export type { ValidationHelpers } from "./helpers";
export { createValidationHelpers } from "./helpers";

const BROWSER_EVALUATOR_GLOBAL_KEY = "__DS_GET_PAGE4_STATE__";
const BROWSER_EVALUATOR_ENTRY_PATH = join(
  import.meta.dir,
  "browser-evaluator-entry.ts"
);
const PAGE4_BENCH_ENABLED = (() => {
  const raw = process.env.PAGE4_STATE_BENCH?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
})();
const PAGE4_BENCH_ITERATIONS = (() => {
  const parsed = Number.parseInt(
    process.env.PAGE4_STATE_BENCH_ITERATIONS ?? "8",
    10
  );
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 8;
})();

let page4EvaluatorScriptPromise: Promise<string> | null = null;
const page4EvaluatorReadyPages = new WeakSet<Page>();
let page4BenchCallCount = 0;
let page4BenchWarmSampleLogged = false;

interface EnsureEvaluatorMetrics {
  coldPageInjection: boolean;
  injectMs: number;
  scriptMs: number;
}

interface Page4BenchSummary {
  avgMs: number;
  iterations: number;
  medianMs: number;
  minMs: number;
  p95Ms: number;
}

function formatBuildLog(log: unknown): string {
  if (typeof log === "string") {
    return log;
  }
  if (log && typeof log === "object" && "message" in log) {
    const { message } = log as { message?: unknown };
    if (typeof message === "string") {
      return message;
    }
  }
  return JSON.stringify(log);
}

async function buildPage4EvaluatorScript(): Promise<string> {
  const buildResult = await Bun.build({
    entrypoints: [BROWSER_EVALUATOR_ENTRY_PATH],
    format: "iife",
    minify: true,
    sourcemap: "none",
    target: "browser",
  });

  if (!buildResult.success) {
    const details = buildResult.logs.map(formatBuildLog).join("; ");
    throw new Error(`Failed to build page4 evaluator bundle: ${details}`);
  }

  const output = buildResult.outputs[0];
  if (!output) {
    throw new Error("Page4 evaluator build produced no output");
  }

  const script = await output.text();
  if (!script.includes(BROWSER_EVALUATOR_GLOBAL_KEY)) {
    throw new Error(
      `Page4 evaluator bundle is missing global key: ${BROWSER_EVALUATOR_GLOBAL_KEY}`
    );
  }

  return script;
}

function getPage4EvaluatorScript(): Promise<string> {
  if (!page4EvaluatorScriptPromise) {
    page4EvaluatorScriptPromise = buildPage4EvaluatorScript();
  }
  return page4EvaluatorScriptPromise;
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const index = quantile * (sorted.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const loValue = sorted[lo] ?? 0;
  const hiValue = sorted[hi] ?? 0;
  if (lo === hi) {
    return loValue;
  }
  return loValue + (hiValue - loValue) * (index - lo);
}

async function ensurePage4Evaluator(
  page: Page
): Promise<EnsureEvaluatorMetrics> {
  if (page4EvaluatorReadyPages.has(page)) {
    return {
      coldPageInjection: false,
      injectMs: 0,
      scriptMs: 0,
    };
  }

  const scriptStart = performance.now();
  const script = await getPage4EvaluatorScript();
  const scriptMs = performance.now() - scriptStart;

  // Run in future documents (navigations) on this page.
  const injectStart = performance.now();
  await page.addInitScript({ content: script });
  // Run in current document immediately.
  await page.addScriptTag({ content: script });
  const injectMs = performance.now() - injectStart;

  page4EvaluatorReadyPages.add(page);
  return {
    coldPageInjection: true,
    injectMs,
    scriptMs,
  };
}

async function evaluatePage4StateInBrowser(page: Page): Promise<Page4State> {
  return (await page.evaluate(
    ({ evaluatorKey, sels }) => {
      const evaluator = (globalThis as Record<string, unknown>)[evaluatorKey] as
        | ((selectorsArg: unknown) => unknown)
        | undefined;

      if (typeof evaluator !== "function") {
        throw new TypeError(
          `Page4 evaluator "${evaluatorKey}" is not available`
        );
      }

      return evaluator(sels);
    },
    {
      evaluatorKey: BROWSER_EVALUATOR_GLOBAL_KEY,
      sels: selectors,
    }
  )) as Page4State;
}

export async function benchmarkPage4State(
  page: Page,
  iterations = PAGE4_BENCH_ITERATIONS
): Promise<Page4BenchSummary> {
  await ensurePage4Evaluator(page);

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await evaluatePage4StateInBrowser(page);
    samples.push(performance.now() - start);
  }

  const minMs = Math.min(...samples);
  const medianMs = percentile(samples, 0.5);
  const p95Ms = percentile(samples, 0.95);
  const avgMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;

  return {
    avgMs,
    iterations: samples.length,
    medianMs,
    minMs,
    p95Ms,
  };
}

/**
 * Get the full state of Page 4.
 *
 * This function handles the coordinate-heavy evaluation of Page 4 categories.
 * It uses the modular category functions to build the full state.
 */
export async function getPage4State(page: Page): Promise<Page4State> {
  const callStart = performance.now();
  const ensureMetrics = await ensurePage4Evaluator(page);
  const evalStart = performance.now();
  const state = await evaluatePage4StateInBrowser(page);
  const evalMs = performance.now() - evalStart;
  const totalMs = performance.now() - callStart;

  if (PAGE4_BENCH_ENABLED) {
    page4BenchCallCount++;
    console.log(
      `[page4-bench] call=${page4BenchCallCount} cold=${ensureMetrics.coldPageInjection ? "yes" : "no"} scriptMs=${ensureMetrics.scriptMs.toFixed(2)} injectMs=${ensureMetrics.injectMs.toFixed(2)} evalMs=${evalMs.toFixed(2)} totalMs=${totalMs.toFixed(2)}`
    );

    if (!page4BenchWarmSampleLogged) {
      page4BenchWarmSampleLogged = true;
      const warmSummary = await benchmarkPage4State(
        page,
        PAGE4_BENCH_ITERATIONS
      );
      console.log(
        `[page4-bench] warm iterations=${warmSummary.iterations} minMs=${warmSummary.minMs.toFixed(2)} medianMs=${warmSummary.medianMs.toFixed(2)} p95Ms=${warmSummary.p95Ms.toFixed(2)} avgMs=${warmSummary.avgMs.toFixed(2)}`
      );
    }
  }

  return state;
}

/**
 * Standardized E2E Test Timeouts
 *
 * All timeout values in milliseconds. Use these instead of magic numbers.
 */
export const TIMEOUTS = {
  /** Quick operations: simple checks, element visibility (10s) */
  quick: 10_000,

  /** Standard operations: navigation, form fills (30s) */
  standard: 30_000,

  /** Complex operations: form submission, page loads (60s) */
  complex: 60_000,

  /** Extended operations: multi-page scraping (120s) */
  extended: 120_000,

  /** Full flow operations: complete scrape runs (300s) */
  flow: 300_000,
} as const;

export type TimeoutKey = keyof typeof TIMEOUTS;

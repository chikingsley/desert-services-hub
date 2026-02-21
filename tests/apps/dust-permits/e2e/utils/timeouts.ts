/**
 * Standardized E2E Test Timeouts
 *
 * All timeout values in milliseconds. Use these instead of magic numbers.
 */
export const TIMEOUTS = {
  /** Quick operations: login, simple navigation (30s) */
  quick: 30_000,

  /** Standard operations: single page workflows (60s) */
  standard: 60_000,

  /** Complex operations: multi-step workflows, popups (120s) */
  complex: 120_000,

  /** Extended operations: batch processing, scraping loops (300s) */
  extended: 300_000,

  /** Full flow operations: complete end-to-end flows (360s) */
  flow: 360_000,
} as const;

export type TimeoutKey = keyof typeof TIMEOUTS;

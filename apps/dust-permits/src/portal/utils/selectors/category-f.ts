/**
 * Category F Selectors - Grading
 *
 * F.1 (siTable:38) - Mass Grading (Yes/No + acres for seasonal periods)
 * F.2 (siTable:39) - Fine Grading (Yes/No only, acres go to Post-K)
 */

/**
 * Category F.1 - Mass Grading
 * Has Yes/No plus avg daily disturbance acres for two seasonal periods
 */
export const categoryF1 = {
  applies: {
    no: '[id="ThePage:siTable:38:sioTable:1:siForm:radio"]',
    yes: '[id="ThePage:siTable:38:sioTable:0:siForm:radio"]',
  },
  /** Avg daily disturbance acres Nov-Feb - goes to Post-K F1 NovFeb section */
  avgDailyDisturbanceNovFeb: '[id="ThePage:siTable:66:sioTable:0:siForm:text"]',
  /** Avg daily disturbance acres Mar-Oct - goes to Post-K F1 MarOct section */
  avgDailyDisturbanceMarOct: '[id="ThePage:siTable:67:sioTable:0:siForm:text"]',
} as const;

/**
 * Category F.2 - Fine Grading
 * NOTE: F.2 is Yes/No only - acres go to Post-K section
 */
export const categoryF2 = {
  applies: {
    no: '[id="ThePage:siTable:39:sioTable:1:siForm:radio"]',
    yes: '[id="ThePage:siTable:39:sioTable:0:siForm:radio"]',
  },
} as const;

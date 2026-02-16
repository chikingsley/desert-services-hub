/**
 * Category G Selectors - Construction
 *
 * G.1 (siTable:41) - Underground Construction
 * G.2 (siTable:42) - Vertical Construction
 */

/**
 * Category G.1 - Underground Construction
 */
export const categoryG1 = {
  applies: {
    no: '[id="ThePage:siTable:41:sioTable:1:siForm:radio"]',
    yes: '[id="ThePage:siTable:41:sioTable:0:siForm:radio"]',
  },
  /** Avg daily disturbed acres - goes to Post-K G1 section */
  avgDailyDisturbedAcres: '[id="ThePage:siTable:59:sioTable:2:siForm:text"]',
} as const;

/**
 * Category G.2 - Vertical Construction
 */
export const categoryG2 = {
  applies: {
    no: '[id="ThePage:siTable:42:sioTable:1:siForm:radio"]',
    yes: '[id="ThePage:siTable:42:sioTable:0:siForm:radio"]',
  },
  /** Avg daily disturbed acres - goes to Post-K G2 section */
  avgDailyDisturbedAcres: '[id="ThePage:siTable:60:sioTable:2:siForm:text"]',
} as const;

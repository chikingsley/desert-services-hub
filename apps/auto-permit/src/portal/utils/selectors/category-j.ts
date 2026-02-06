/**
 * Category J Selectors - Blasting
 *
 * siTable:48 - Blasting activities
 */

/**
 * Category J - Blasting
 */
export const categoryJ = {
  applies: {
    yes: '[id="ThePage:siTable:48:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:48:sioTable:1:siForm:radio"]',
  },
  /** Water (sioTable:3) */
  water: {
    Primary: '[id="ThePage:siTable:48:sioTable:3:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:48:sioTable:3:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:48:sioTable:3:siForm:radioTable:2:radio"]',
  },
  /** Dust Suppressants (sioTable:4) */
  dustSuppressants: {
    Primary: '[id="ThePage:siTable:48:sioTable:4:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:48:sioTable:4:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:48:sioTable:4:siForm:radioTable:2:radio"]',
  },
  /** Dust suppressant frequency (sioTable:14) */
  suppressantFrequency: '[id="ThePage:siTable:48:sioTable:14:siForm:text"]',
  /** Dust suppressant amount (sioTable:15) */
  suppressantAmount: '[id="ThePage:siTable:48:sioTable:15:siForm:text"]',
  /** Other (sioTable:5) - Only has Contingency/None options (no Primary) */
  other: {
    Contingency:
      '[id="ThePage:siTable:48:sioTable:5:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:48:sioTable:5:siForm:radioTable:1:radio"]',
  },
  /** Other description (sioTable:18) - shown when other is Contingency */
  otherDescription: '[id="ThePage:siTable:48:sioTable:18:siForm:textarea"]',
  /** Avg daily disturbed acres - goes to Post-K J section */
  avgDailyDisturbedAcres: '[id="ThePage:siTable:64:sioTable:2:siForm:text"]',
} as const;

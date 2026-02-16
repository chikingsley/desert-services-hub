/**
 * Category H Selectors - Demolition
 *
 * siTable:44 - Demolition activities
 */

/**
 * Category H - Demolition
 */
export const categoryH = {
  applies: {
    no: '[id="ThePage:siTable:44:sioTable:1:siForm:radio"]',
    yes: '[id="ThePage:siTable:44:sioTable:0:siForm:radio"]',
  },
  /** Use dust suppressants - checkbox needs { yes, no } structure */
  useDustSuppressants: {
    no: "",
    yes: '[id="ThePage:siTable:44:sioTable:3:siForm:checkbox"]',
  },
  /** Dust suppressant frequency (sioTable:7) */
  suppressantFrequency: '[id="ThePage:siTable:44:sioTable:7:siForm:text"]',
  /** Dust suppressant amount (sioTable:8) */
  suppressantAmount: '[id="ThePage:siTable:44:sioTable:8:siForm:text"]',
  /** Clean debris (Contingency/None only) */
  cleanDebris: {
    Contingency:
      '[id="ThePage:siTable:44:sioTable:5:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:44:sioTable:5:siForm:radioTable:1:radio"]',
  },
  /** Other (Contingency/None only) */
  other: {
    Contingency:
      '[id="ThePage:siTable:44:sioTable:6:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:44:sioTable:6:siForm:radioTable:1:radio"]',
  },
  /** Other description (sioTable:13) - shown when other is Contingency */
  otherDescription: '[id="ThePage:siTable:44:sioTable:13:siForm:textarea"]',
  /** Avg daily disturbed acres - goes to Post-K H section */
  avgDailyDisturbedAcres: '[id="ThePage:siTable:61:sioTable:2:siForm:text"]',
} as const;

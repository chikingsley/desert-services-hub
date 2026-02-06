/**
 * Category I Selectors - Weed Abatement
 *
 * I.1 (siTable:46) - During Weed Abatement Disturbance (Contingency/None only)
 * I.2 (siTable:46) - Stabilization following Weed Abatement
 */

/**
 * Category I.1 - During Weed Abatement Disturbance
 * NOTE: I.1 only allows Contingency/None (no Primary)
 */
export const categoryI1 = {
  applies: {
    yes: '[id="ThePage:siTable:46:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:46:sioTable:1:siForm:radio"]',
  },
  /** Cease Operations (sioTable:3) - Contingency/None only */
  ceaseOperations: {
    Contingency:
      '[id="ThePage:siTable:46:sioTable:3:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:46:sioTable:3:siForm:radioTable:1:radio"]',
  },
  /** Other (sioTable:4) - Contingency/None only */
  other: {
    Contingency:
      '[id="ThePage:siTable:46:sioTable:4:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:46:sioTable:4:siForm:radioTable:1:radio"]',
  },
  /** Other description (sioTable:34) - shown when other is Contingency */
  otherDescription: '[id="ThePage:siTable:46:sioTable:34:siForm:textarea"]',
  /** Avg daily disturbed acres - goes to Post-K I1 section */
  avgDailyDisturbedAcres: '[id="ThePage:siTable:62:sioTable:2:siForm:text"]',
} as const;

/**
 * Category I.2 - Stabilization following Weed Abatement
 * No Yes/No - control measures only
 */
export const categoryI2 = {
  /** Pave (sioTable:6) */
  pave: {
    Primary: '[id="ThePage:siTable:46:sioTable:6:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:46:sioTable:6:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:46:sioTable:6:siForm:radioTable:2:radio"]',
  },
  /** Gravel (sioTable:7) */
  gravel: {
    Primary: '[id="ThePage:siTable:46:sioTable:7:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:46:sioTable:7:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:46:sioTable:7:siForm:radioTable:2:radio"]',
  },
  /** Water (sioTable:8) */
  water: {
    Primary: '[id="ThePage:siTable:46:sioTable:8:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:46:sioTable:8:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:46:sioTable:8:siForm:radioTable:2:radio"]',
  },
  /** Dust Suppressants (sioTable:9) */
  dustSuppressants: {
    Primary: '[id="ThePage:siTable:46:sioTable:9:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:46:sioTable:9:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:46:sioTable:9:siForm:radioTable:2:radio"]',
  },
  /** Dust suppressant frequency - dynamic index */
  suppressantFrequency: '[id="ThePage:siTable:46:sioTable:35:siForm:text"]',
  suppressantFrequencyFallbacks: [
    '[id="ThePage:siTable:46:sioTable:36:siForm:text"]',
    '[id="ThePage:siTable:46:sioTable:37:siForm:text"]',
    '[id="ThePage:siTable:46:sioTable:34:siForm:text"]',
  ],
  /** Dust suppressant amount - dynamic index */
  suppressantAmount: '[id="ThePage:siTable:46:sioTable:36:siForm:text"]',
  suppressantAmountFallbacks: [
    '[id="ThePage:siTable:46:sioTable:37:siForm:text"]',
    '[id="ThePage:siTable:46:sioTable:38:siForm:text"]',
    '[id="ThePage:siTable:46:sioTable:35:siForm:text"]',
  ],
  /** Vegetation (sioTable:10) */
  vegetation: {
    Primary: '[id="ThePage:siTable:46:sioTable:10:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:46:sioTable:10:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:46:sioTable:10:siForm:radioTable:2:radio"]',
  },
  /** Other (sioTable:11) */
  other: {
    Primary: '[id="ThePage:siTable:46:sioTable:11:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:46:sioTable:11:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:46:sioTable:11:siForm:radioTable:2:radio"]',
  },
  /** Other description - dynamic index */
  otherDescription: '[id="ThePage:siTable:46:sioTable:39:siForm:textarea"]',
  otherDescriptionFallbacks: [
    '[id="ThePage:siTable:46:sioTable:40:siForm:textarea"]',
    '[id="ThePage:siTable:46:sioTable:41:siForm:textarea"]',
    '[id="ThePage:siTable:46:sioTable:38:siForm:textarea"]',
  ],
} as const;

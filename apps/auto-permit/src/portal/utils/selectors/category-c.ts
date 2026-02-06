/**
 * Category C Selectors - Disturbed Surface Areas
 *
 * C.1 (siTable:24) - Before/after daily construction (no Yes/No)
 * C.2 (siTable:25) - During active operations (no Yes/No)
 * C.3 (siTable:26) - Inactive periods (no Yes/No)
 * C.4 (siTable:27) - Permanent stabilization (no Yes/No)
 */

/**
 * Category C.1 - Before/after daily construction
 * No Yes/No question - always required. Three control measures.
 */
export const categoryC1 = {
  /** Pre-water (sioTable:0) */
  preWater: {
    Primary: '[id="ThePage:siTable:24:sioTable:0:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:24:sioTable:0:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:24:sioTable:0:siForm:radioTable:2:radio"]',
  },
  /** Phase work (sioTable:1) */
  phaseWork: {
    Primary: '[id="ThePage:siTable:24:sioTable:1:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:24:sioTable:1:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:24:sioTable:1:siForm:radioTable:2:radio"]',
  },
  /** Other (sioTable:2) */
  other: {
    Primary: '[id="ThePage:siTable:24:sioTable:2:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:24:sioTable:2:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:24:sioTable:2:siForm:radioTable:2:radio"]',
  },
  /** Other description - shown when other is Primary or Contingency */
  otherDescription:
    '[id*="siTable:24:sioTable"] textarea[id$=":siForm:textarea"]:has(~ img[title="Other:"])',
} as const;

/**
 * Category C.2 - During active operations
 * No Yes/No question - always required. Five control measures.
 */
export const categoryC2 = {
  /** Visibly moist (sioTable:0) */
  visiblyMoist: {
    Primary: '[id="ThePage:siTable:25:sioTable:0:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:25:sioTable:0:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:25:sioTable:0:siForm:radioTable:2:radio"]',
  },
  /** ASTM (sioTable:1) */
  astm: {
    Primary: '[id="ThePage:siTable:25:sioTable:1:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:25:sioTable:1:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:25:sioTable:1:siForm:radioTable:2:radio"]',
  },
  /** Dust Suppressants (sioTable:2) - FormData calls this "suppressants" */
  suppressants: {
    Primary: '[id="ThePage:siTable:25:sioTable:2:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:25:sioTable:2:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:25:sioTable:2:siForm:radioTable:2:radio"]',
  },
  /** Wind barriers (sioTable:3) */
  windBarriers: {
    Primary: '[id="ThePage:siTable:25:sioTable:3:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:25:sioTable:3:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:25:sioTable:3:siForm:radioTable:2:radio"]',
  },
  /** Other (sioTable:4) */
  other: {
    Primary: '[id="ThePage:siTable:25:sioTable:4:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:25:sioTable:4:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:25:sioTable:4:siForm:radioTable:2:radio"]',
  },
  /** Dust suppressant frequency */
  suppressantFrequency:
    '[id*="siTable:25"] input.Frequency-of-application--Dust-suppressants-',
  /** Dust suppressant amount */
  suppressantAmount: '[id*="siTable:25"] input.Amount--Dust-suppressants-',
  /** Other description */
  otherDescription:
    '[id*="siTable:25:sioTable"] textarea[id$=":siForm:textarea"]:has(~ img[title="Other:"])',
} as const;

/**
 * Category C.3 - Inactive periods
 * No Yes/No question - always required. Six control measures.
 */
export const categoryC3 = {
  /** Apply water (sioTable:0) */
  applyWater: {
    Primary: '[id="ThePage:siTable:26:sioTable:0:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:26:sioTable:0:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:26:sioTable:0:siForm:radioTable:2:radio"]',
  },
  /** Surface gravel (sioTable:1) */
  surfaceGravel: {
    Primary: '[id="ThePage:siTable:26:sioTable:1:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:26:sioTable:1:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:26:sioTable:1:siForm:radioTable:2:radio"]',
  },
  /** Dust Suppressants (sioTable:2) */
  suppressants: {
    Primary: '[id="ThePage:siTable:26:sioTable:2:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:26:sioTable:2:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:26:sioTable:2:siForm:radioTable:2:radio"]',
  },
  /** Dust suppressant frequency */
  suppressantFrequency:
    '[id*="siTable:26"] input.Frequency-of-application--Dust-suppressants-',
  /** Dust suppressant amount */
  suppressantAmount: '[id*="siTable:26"] input.Amount--Dust-suppressants-',
  /** Cover tarps (sioTable:3) */
  coverTarps: {
    Primary: '[id="ThePage:siTable:26:sioTable:3:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:26:sioTable:3:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:26:sioTable:3:siForm:radioTable:2:radio"]',
  },
  /** Vegetative (sioTable:4) */
  vegetative: {
    Primary: '[id="ThePage:siTable:26:sioTable:4:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:26:sioTable:4:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:26:sioTable:4:siForm:radioTable:2:radio"]',
  },
  /** Other (sioTable:5) */
  other: {
    Primary: '[id="ThePage:siTable:26:sioTable:5:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:26:sioTable:5:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:26:sioTable:5:siForm:radioTable:2:radio"]',
  },
  /** Other description */
  otherDescription:
    '[id*="siTable:26:sioTable"] textarea[id$=":siForm:textarea"]:has(~ img[title="Other:"])',
} as const;

/**
 * Category C.4 - Permanent stabilization
 * No Yes/No question - always required. Nine control measures.
 */
export const categoryC4 = {
  /** Pave (sioTable:0) */
  pave: {
    Primary: '[id="ThePage:siTable:27:sioTable:0:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:27:sioTable:0:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:27:sioTable:0:siForm:radioTable:2:radio"]',
  },
  /** Gravel (sioTable:1) */
  gravel: {
    Primary: '[id="ThePage:siTable:27:sioTable:1:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:27:sioTable:1:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:27:sioTable:1:siForm:radioTable:2:radio"]',
  },
  /** Dust Suppressants (sioTable:2) */
  suppressants: {
    Primary: '[id="ThePage:siTable:27:sioTable:2:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:27:sioTable:2:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:27:sioTable:2:siForm:radioTable:2:radio"]',
  },
  /** Vegetative (sioTable:3) */
  vegetative: {
    Primary: '[id="ThePage:siTable:27:sioTable:3:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:27:sioTable:3:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:27:sioTable:3:siForm:radioTable:2:radio"]',
  },
  /** Restrict access (sioTable:4) */
  restrictAccess: {
    Primary: '[id="ThePage:siTable:27:sioTable:4:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:27:sioTable:4:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:27:sioTable:4:siForm:radioTable:2:radio"]',
  },
  /** Apply water prevent (sioTable:5) */
  applyWaterPrevent: {
    Primary: '[id="ThePage:siTable:27:sioTable:5:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:27:sioTable:5:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:27:sioTable:5:siForm:radioTable:2:radio"]',
  },
  /** Prevent access (sioTable:6) */
  preventAccess: {
    Primary: '[id="ThePage:siTable:27:sioTable:6:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:27:sioTable:6:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:27:sioTable:6:siForm:radioTable:2:radio"]',
  },
  /** Restore vegetation (sioTable:7) */
  restoreVegetation: {
    Primary: '[id="ThePage:siTable:27:sioTable:7:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:27:sioTable:7:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:27:sioTable:7:siForm:radioTable:2:radio"]',
  },
  /** Other (sioTable:8) */
  other: {
    Primary: '[id="ThePage:siTable:27:sioTable:8:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:27:sioTable:8:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:27:sioTable:8:siForm:radioTable:2:radio"]',
  },
  /** Paving timing (sioTable:37 - only appears when pave is not None) */
  paveWhen: {
    prior: '[id="ThePage:siTable:27:sioTable:37:siForm:radioTable:0:radio"]',
    during: '[id="ThePage:siTable:27:sioTable:37:siForm:radioTable:1:radio"]',
    end: '[id="ThePage:siTable:27:sioTable:37:siForm:radioTable:2:radio"]',
  },
  paveWhenFallbacks: {
    prior: ['[id="ThePage:siTable:27:sioTable:36:siForm:radioTable:0:radio"]'],
    during: ['[id="ThePage:siTable:27:sioTable:36:siForm:radioTable:1:radio"]'],
    end: ['[id="ThePage:siTable:27:sioTable:36:siForm:radioTable:2:radio"]'],
  },
  /** Dust suppressant frequency */
  suppressantFrequency: '[id="ThePage:siTable:27:sioTable:40:siForm:text"]',
  suppressantFrequencyFallbacks: [
    '[id="ThePage:siTable:27:sioTable:39:siForm:text"]',
    '[id="ThePage:siTable:27:sioTable:38:siForm:text"]',
  ],
  /** Dust suppressant amount */
  suppressantAmount: '[id="ThePage:siTable:27:sioTable:41:siForm:text"]',
  suppressantAmountFallbacks: [
    '[id="ThePage:siTable:27:sioTable:40:siForm:text"]',
    '[id="ThePage:siTable:27:sioTable:39:siForm:text"]',
  ],
  /** Apply water prevent methods */
  applyWaterPreventMethods: {
    ditches:
      '[id="ThePage:siTable:27:sioTable:42:siForm:checkboxTable:0:checkbox"]',
    fences:
      '[id="ThePage:siTable:27:sioTable:42:siForm:checkboxTable:1:checkbox"]',
    berms:
      '[id="ThePage:siTable:27:sioTable:42:siForm:checkboxTable:2:checkbox"]',
    shrubs:
      '[id="ThePage:siTable:27:sioTable:42:siForm:checkboxTable:3:checkbox"]',
    trees:
      '[id="ThePage:siTable:27:sioTable:42:siForm:checkboxTable:4:checkbox"]',
    other:
      '[id="ThePage:siTable:27:sioTable:42:siForm:checkboxTable:5:checkbox"]',
  },
  /** Prevent access methods */
  preventAccessMethods: {
    ditches:
      '[id="ThePage:siTable:27:sioTable:45:siForm:checkboxTable:0:checkbox"]',
    fences:
      '[id="ThePage:siTable:27:sioTable:45:siForm:checkboxTable:1:checkbox"]',
    berms:
      '[id="ThePage:siTable:27:sioTable:45:siForm:checkboxTable:2:checkbox"]',
    shrubs:
      '[id="ThePage:siTable:27:sioTable:45:siForm:checkboxTable:3:checkbox"]',
    trees:
      '[id="ThePage:siTable:27:sioTable:45:siForm:checkboxTable:4:checkbox"]',
    other:
      '[id="ThePage:siTable:27:sioTable:45:siForm:checkboxTable:5:checkbox"]',
  },
  /** Apply water prevent other text */
  applyWaterPreventOtherText:
    '[id="ThePage:siTable:27:sioTable:47:siForm:textarea"]',
  /** Prevent access other text */
  preventAccessOtherText:
    '[id="ThePage:siTable:27:sioTable:78:siForm:textarea"]',
  /** Other description */
  otherDescription: '[id="ThePage:siTable:27:sioTable:81:siForm:textarea"]',
  otherDescriptionFallbacks: [
    '[id="ThePage:siTable:27:sioTable:80:siForm:textarea"]',
    '[id="ThePage:siTable:27:sioTable:79:siForm:textarea"]',
  ],
} as const;

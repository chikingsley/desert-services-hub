/**
 * Category D Selectors - Bulk Material Handling
 *
 * D.1 (siTable:29) - Materials Hauled FROM Site (Contingency/None only)
 * D.2 (siTable:30) - Materials Hauled WITHIN Site
 * D.3 (siTable:31) - Materials Crossing Public Areas (Contingency/None only)
 * D.4 (siTable:32) - Loading/Unloading/Stacking
 * D.5 (siTable:33) - Open Storage Piles
 */

/**
 * Category D.1 - Materials Hauled FROM Site
 * NOTE: D.1 only allows Contingency/None (no Primary options in form)
 */
export const categoryD1 = {
  applies: {
    yes: '[id="ThePage:siTable:29:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:29:sioTable:1:siForm:radio"]',
  },
  /** Apply water top of load (sioTable:3) - Contingency/None only */
  waterTopOfLoad: {
    Contingency:
      '[id="ThePage:siTable:29:sioTable:3:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:29:sioTable:3:siForm:radioTable:1:radio"]',
  },
  /** Apply dust suppressants top of load (sioTable:4) - Contingency/None only */
  dustSuppressantsTopOfLoad: {
    Contingency:
      '[id="ThePage:siTable:29:sioTable:4:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:29:sioTable:4:siForm:radioTable:1:radio"]',
  },
  /** Cease operations (sioTable:5) - Contingency/None only */
  ceaseOperations: {
    Contingency:
      '[id="ThePage:siTable:29:sioTable:5:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:29:sioTable:5:siForm:radioTable:1:radio"]',
  },
  /** Other (sioTable:6) - Contingency/None only */
  other: {
    Contingency:
      '[id="ThePage:siTable:29:sioTable:6:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:29:sioTable:6:siForm:radioTable:1:radio"]',
  },
  /** Other description (sioTable:16) - shown when other is Contingency */
  otherDescription: '[id="ThePage:siTable:29:sioTable:16:siForm:textarea"]',
} as const;

/**
 * Category D.2 - Materials Hauled WITHIN Site
 * Has Primary/Contingency/None for most measures
 */
export const categoryD2 = {
  applies: {
    yes: '[id="ThePage:siTable:30:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:30:sioTable:1:siForm:radio"]',
  },
  /** Limit speed (sioTable:3) */
  limitSpeed: {
    Primary: '[id="ThePage:siTable:30:sioTable:3:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:30:sioTable:3:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:30:sioTable:3:siForm:radioTable:2:radio"]',
  },
  /** Apply water top of load (sioTable:4) */
  waterTopOfLoad: {
    Primary: '[id="ThePage:siTable:30:sioTable:4:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:30:sioTable:4:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:30:sioTable:4:siForm:radioTable:2:radio"]',
  },
  /** Apply dust suppressants top of load (sioTable:5) */
  dustSuppressantsTopOfLoad: {
    Primary: '[id="ThePage:siTable:30:sioTable:5:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:30:sioTable:5:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:30:sioTable:5:siForm:radioTable:2:radio"]',
  },
  /** Cover haul trucks (sioTable:6) - matches FormData field name "coverTrucks" */
  coverTrucks: {
    Primary: '[id="ThePage:siTable:30:sioTable:6:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:30:sioTable:6:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:30:sioTable:6:siForm:radioTable:2:radio"]',
  },
  /** Cease operations (sioTable:7) - Contingency/None only */
  ceaseOperations: {
    Contingency:
      '[id="ThePage:siTable:30:sioTable:7:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:30:sioTable:7:siForm:radioTable:1:radio"]',
  },
  /** Other (sioTable:8) */
  other: {
    Primary: '[id="ThePage:siTable:30:sioTable:8:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:30:sioTable:8:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:30:sioTable:8:siForm:radioTable:2:radio"]',
  },
  /**
   * Other description - shown when other is Primary or Contingency
   * NOTE: sioTable index shifts dynamically. Using primary selector with fallbacks in helpers.
   */
  otherDescription: '[id="ThePage:siTable:30:sioTable:30:siForm:textarea"]',
  /** Fallback selectors for otherDescription (dynamic form state) */
  otherDescriptionFallbacks: [
    '[id="ThePage:siTable:30:sioTable:31:siForm:textarea"]',
    '[id="ThePage:siTable:30:sioTable:29:siForm:textarea"]',
  ],
} as const;

/**
 * Category D.3 - Materials Crossing Public Areas
 * NOTE: D.3 only allows Contingency/None (no Primary options in form)
 */
export const categoryD3 = {
  applies: {
    yes: '[id="ThePage:siTable:31:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:31:sioTable:1:siForm:radio"]',
  },
  /** Cease operations (sioTable:3) - Contingency/None only */
  ceaseOperations: {
    Contingency:
      '[id="ThePage:siTable:31:sioTable:3:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:31:sioTable:3:siForm:radioTable:1:radio"]',
  },
  /** Other (sioTable:4) - Contingency/None only */
  other: {
    Contingency:
      '[id="ThePage:siTable:31:sioTable:4:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:31:sioTable:4:siForm:radioTable:1:radio"]',
  },
  /** Other description (sioTable:9) - shown when other is Contingency */
  otherDescription: '[id="ThePage:siTable:31:sioTable:9:siForm:textarea"]',
} as const;

/**
 * Category D.4 - Loading/Unloading/Stacking
 */
export const categoryD4 = {
  applies: {
    yes: '[id="ThePage:siTable:32:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:32:sioTable:1:siForm:radio"]',
  },
  /** Cease operations (sioTable:3) - Contingency/None only */
  ceaseOperations: {
    Contingency:
      '[id="ThePage:siTable:32:sioTable:3:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:32:sioTable:3:siForm:radioTable:1:radio"]',
  },
  /** Apply water (sioTable:4) */
  water: {
    Primary: '[id="ThePage:siTable:32:sioTable:4:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:32:sioTable:4:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:32:sioTable:4:siForm:radioTable:2:radio"]',
  },
  /** Apply dust suppressants (sioTable:5) */
  dustSuppressants: {
    Primary: '[id="ThePage:siTable:32:sioTable:5:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:32:sioTable:5:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:32:sioTable:5:siForm:radioTable:2:radio"]',
  },
  /**
   * Dust suppressant frequency - shown when dust suppressants is Primary or Contingency
   * NOTE: Index shifts dynamically between 17-19
   */
  suppressantFrequency: '[id="ThePage:siTable:32:sioTable:19:siForm:text"]',
  suppressantFrequencyFallbacks: [
    '[id="ThePage:siTable:32:sioTable:17:siForm:text"]',
    '[id="ThePage:siTable:32:sioTable:18:siForm:text"]',
  ],
  /**
   * Dust suppressant amount - shown when dust suppressants is Primary or Contingency
   * NOTE: Index shifts dynamically between 18-20
   */
  suppressantAmount: '[id="ThePage:siTable:32:sioTable:20:siForm:text"]',
  suppressantAmountFallbacks: [
    '[id="ThePage:siTable:32:sioTable:18:siForm:text"]',
    '[id="ThePage:siTable:32:sioTable:19:siForm:text"]',
  ],
  /** Other (sioTable:6) - Form only has Contingency/None but type requires Primary */
  other: {
    Primary: "", // Not available in form - type satisfaction only
    Contingency:
      '[id="ThePage:siTable:32:sioTable:6:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:32:sioTable:6:siForm:radioTable:1:radio"]',
  },
  /**
   * Other description - shown when other is Contingency
   * NOTE: Index shifts dynamically between 21-23
   */
  otherDescription: '[id="ThePage:siTable:32:sioTable:21:siForm:textarea"]',
  otherDescriptionFallbacks: [
    '[id="ThePage:siTable:32:sioTable:22:siForm:textarea"]',
    '[id="ThePage:siTable:32:sioTable:23:siForm:textarea"]',
  ],
} as const;

/**
 * Category D.5 - Open Storage Piles
 */
export const categoryD5 = {
  applies: {
    yes: '[id="ThePage:siTable:33:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:33:sioTable:1:siForm:radio"]',
  },
  /** Cover piles (sioTable:3) */
  coverPiles: {
    Primary: '[id="ThePage:siTable:33:sioTable:3:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:33:sioTable:3:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:33:sioTable:3:siForm:radioTable:2:radio"]',
  },
  /** Maintain moisture (sioTable:4) */
  maintainMoisture: {
    Primary: '[id="ThePage:siTable:33:sioTable:4:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:33:sioTable:4:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:33:sioTable:4:siForm:radioTable:2:radio"]',
  },
  /** Maintain crust (sioTable:5) */
  maintainCrust: {
    Primary: '[id="ThePage:siTable:33:sioTable:5:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:33:sioTable:5:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:33:sioTable:5:siForm:radioTable:2:radio"]',
  },
  /** Wind barriers (sioTable:6) */
  windBarriers: {
    Primary: '[id="ThePage:siTable:33:sioTable:6:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:33:sioTable:6:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:33:sioTable:6:siForm:radioTable:2:radio"]',
  },
  /** Other (sioTable:7) */
  other: {
    Primary: '[id="ThePage:siTable:33:sioTable:7:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:33:sioTable:7:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:33:sioTable:7:siForm:radioTable:2:radio"]',
  },
  /** Other description (sioTable:28) - shown when other is Primary or Contingency */
  otherDescription: '[id="ThePage:siTable:33:sioTable:28:siForm:textarea"]',
} as const;

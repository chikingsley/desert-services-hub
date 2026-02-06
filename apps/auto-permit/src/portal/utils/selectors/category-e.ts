/**
 * Category E Selectors - Trackout Control
 *
 * E.1 (siTable:35) - Trackout Control Devices
 * E.2 (siTable:36) - Spillage Cleaning
 */

/**
 * Category E.1 - Trackout Control Devices
 * NOTE: E.1 control measures only allow Contingency/None (no Primary)
 */
export const categoryE1 = {
  applies: {
    yes: '[id="ThePage:siTable:35:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:35:sioTable:1:siForm:radio"]',
  },
  /** Trackout control devices - maps each device type to its checkbox selector */
  deviceType: {
    gravel_pad:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:0:checkbox"]',
    grizzly:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:1:checkbox"]',
    wheel_wash:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:2:checkbox"]',
    paved_area:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:3:checkbox"]',
    other:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:4:checkbox"]',
  },
  /** Device "other" description */
  deviceTypeOther: '[id="ThePage:siTable:35:sioTable:14:siForm:textarea"]',
  /** Cease operations (Contingency/None only, no Primary) */
  ceaseOperations: {
    Contingency:
      '[id="ThePage:siTable:35:sioTable:3:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:35:sioTable:3:siForm:radioTable:1:radio"]',
  },
  /** "Other" control measure (Contingency/None only, no Primary) */
  other: {
    Contingency:
      '[id="ThePage:siTable:35:sioTable:4:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:35:sioTable:4:siForm:radioTable:1:radio"]',
  },
  /** Other description (sioTable:15) - shown when other control measure is Contingency */
  otherDescription: '[id="ThePage:siTable:35:sioTable:15:siForm:textarea"]',
} as const;

/**
 * Category E.2 - Spillage Cleaning
 * No Yes/No - always required
 */
export const categoryE2 = {
  /** Street Sweeper (Primary/Contingency/None) */
  streetSweeper: {
    Primary: '[id="ThePage:siTable:36:sioTable:1:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:36:sioTable:1:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:36:sioTable:1:siForm:radioTable:2:radio"]',
  },
  /** Manual Sweep (Primary/Contingency/None) - FormData calls this "manuallySweep" */
  manuallySweep: {
    Primary: '[id="ThePage:siTable:36:sioTable:2:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:36:sioTable:2:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:36:sioTable:2:siForm:radioTable:2:radio"]',
  },
  /** Other (Primary/Contingency/None) */
  other: {
    Primary: '[id="ThePage:siTable:36:sioTable:3:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:36:sioTable:3:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:36:sioTable:3:siForm:radioTable:2:radio"]',
  },
  /** Other description (sioTable:16) - shown when other is Primary or Contingency */
  otherDescription: '[id="ThePage:siTable:36:sioTable:16:siForm:textarea"]',
} as const;

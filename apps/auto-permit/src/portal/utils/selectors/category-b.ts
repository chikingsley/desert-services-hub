/**
 * Category B Selectors - Unpaved Roads and Staging Areas
 *
 * B.1 (siTable:21) - Unpaved Staging Areas
 * B.2 (siTable:22) - Unpaved Access Roads
 */

/**
 * Category B.1 - Unpaved Staging Areas
 */
export const categoryB1 = {
  applies: {
    yes: '[id="ThePage:siTable:21:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:21:sioTable:1:siForm:radio"]',
  },
  /** Pave (sioTable:3) */
  pave: {
    Primary: '[id="ThePage:siTable:21:sioTable:3:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:21:sioTable:3:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:21:sioTable:3:siForm:radioTable:2:radio"]',
  },
  /** Gravel (sioTable:4) */
  gravel: {
    Primary: '[id="ThePage:siTable:21:sioTable:4:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:21:sioTable:4:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:21:sioTable:4:siForm:radioTable:2:radio"]',
  },
  /** Water (sioTable:5) */
  water: {
    Primary: '[id="ThePage:siTable:21:sioTable:5:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:21:sioTable:5:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:21:sioTable:5:siForm:radioTable:2:radio"]',
  },
  /** Dust Suppressants (sioTable:6) */
  dustSuppressants: {
    Primary: '[id="ThePage:siTable:21:sioTable:6:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:21:sioTable:6:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:21:sioTable:6:siForm:radioTable:2:radio"]',
  },
  /** Limit Trips (sioTable:7) */
  limitTrips: {
    Primary: '[id="ThePage:siTable:21:sioTable:7:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:21:sioTable:7:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:21:sioTable:7:siForm:radioTable:2:radio"]',
  },
  /** Other (sioTable:8) */
  other: {
    Primary: '[id="ThePage:siTable:21:sioTable:8:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:21:sioTable:8:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:21:sioTable:8:siForm:radioTable:2:radio"]',
  },
  /** Paving timing radios (sioTable:29) - shown when pave is Primary or Contingency */
  paveWhen: {
    prior: '[id="ThePage:siTable:21:sioTable:29:siForm:radioTable:0:radio"]',
    during: '[id="ThePage:siTable:21:sioTable:29:siForm:radioTable:1:radio"]',
    end: '[id="ThePage:siTable:21:sioTable:29:siForm:radioTable:2:radio"]',
  },
  /** Dust suppressant frequency */
  dustSuppressantsFrequency:
    '[id*="siTable:21"] input.Frequency-of-application--Dust-suppressants-',
  /** Dust suppressant amount */
  dustSuppressantsAmount: '[id*="siTable:21"] input.Amount--Dust-suppressants-',
  /** Limit trips max */
  limitTripsMax:
    '[id*="siTable:21"] input[class*="Maximum-number-of-vehicle-trips"]',
  /** Speed restriction method */
  speedRestrictionMethod:
    '[id*="siTable:21:sioTable"] textarea[id$=":siForm:textarea"]:has(~ img[title*="vehicle speeds will be restricted"])',
  /** Other description */
  otherDescription:
    '[id*="siTable:21:sioTable"] textarea[id$=":siForm:textarea"]:has(~ img[title="Other:"])',
  /** Average daily disturbed acres */
  avgDailyDisturbedAcres: '[id="ThePage:siTable:21:sioTable:30:siForm:text"]',
} as const;

/**
 * Category B.2 - Unpaved Access Roads
 * NOTE: ceaseOperations only has Contingency/None (no Primary allowed per form)
 */
export const categoryB2 = {
  applies: {
    yes: '[id="ThePage:siTable:22:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:22:sioTable:1:siForm:radio"]',
  },
  /** Pave (sioTable:3) */
  pave: {
    Primary: '[id="ThePage:siTable:22:sioTable:3:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:22:sioTable:3:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:22:sioTable:3:siForm:radioTable:2:radio"]',
  },
  /** Gravel (sioTable:4) */
  gravel: {
    Primary: '[id="ThePage:siTable:22:sioTable:4:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:22:sioTable:4:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:22:sioTable:4:siForm:radioTable:2:radio"]',
  },
  /** Water (sioTable:5) */
  water: {
    Primary: '[id="ThePage:siTable:22:sioTable:5:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:22:sioTable:5:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:22:sioTable:5:siForm:radioTable:2:radio"]',
  },
  /** Dust Suppressants (sioTable:6) */
  dustSuppressants: {
    Primary: '[id="ThePage:siTable:22:sioTable:6:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:22:sioTable:6:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:22:sioTable:6:siForm:radioTable:2:radio"]',
  },
  /** Limit Trips (sioTable:7) */
  limitTrips: {
    Primary: '[id="ThePage:siTable:22:sioTable:7:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:22:sioTable:7:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:22:sioTable:7:siForm:radioTable:2:radio"]',
  },
  /** Other (sioTable:8) - has Primary/Contingency/None */
  other: {
    Primary: '[id="ThePage:siTable:22:sioTable:8:siForm:radioTable:0:radio"]',
    Contingency:
      '[id="ThePage:siTable:22:sioTable:8:siForm:radioTable:1:radio"]',
    None: '[id="ThePage:siTable:22:sioTable:8:siForm:radioTable:2:radio"]',
  },
  /** Cease Operations (sioTable:9) - ONLY Contingency/None (no Primary!) */
  ceaseOperations: {
    Contingency:
      '[id="ThePage:siTable:22:sioTable:9:siForm:radioTable:0:radio"]',
    None: '[id="ThePage:siTable:22:sioTable:9:siForm:radioTable:1:radio"]',
  },
  /** Paving timing radios - shown when pave is Primary or Contingency */
  paveWhen: {
    prior: '[id="ThePage:siTable:22:sioTable:36:siForm:radioTable:0:radio"]',
    during: '[id="ThePage:siTable:22:sioTable:36:siForm:radioTable:1:radio"]',
    end: '[id="ThePage:siTable:22:sioTable:36:siForm:radioTable:2:radio"]',
  },
  /** Dust suppressant frequency */
  dustSuppressantsFrequency:
    '[id*="siTable:22"] input.Frequency-of-application--Dust-suppressants-',
  /** Dust suppressant amount */
  dustSuppressantsAmount: '[id*="siTable:22"] input.Amount--Dust-suppressants-',
  /** Limit trips max */
  limitTripsMax:
    '[id*="siTable:22"] input[class*="Maximum-number-of-vehicle-trips"]',
  /** Speed restriction method */
  speedRestrictionMethod:
    '[id*="siTable:22:sioTable"] textarea[id$=":siForm:textarea"]:has(~ img[title*="vehicle speeds will be restricted"])',
  /** Cease operations area specification - shown when cease operations is Contingency */
  ceaseOperationsAreaSpecification:
    '[id*="siTable:22:sioTable"] textarea[id$=":siForm:textarea"]:has(~ img[title*="Specify which area"])',
  /** Other description */
  otherDescription:
    '[id*="siTable:22:sioTable"] textarea[id$=":siForm:textarea"]:has(~ img[title="Other:"])',
  /** Average daily disturbed acres */
  avgDailyDisturbedAcres: '[id="ThePage:siTable:22:sioTable:37:siForm:text"]',
} as const;

/**
 * Page 3 Selectors - Project Details
 *
 * siTable:8 - Primary Project Contact
 * siTable:10 - Coordinator question (index varies by app type)
 * siTable:11 - Project Info
 * siTable:12 - Site Location (page 2 but referenced here)
 * siTable:13, 16 - Project specs
 */

/** siTable:8 - Primary Project Contact */
export const primaryContact = {
  firstName: '[id="ThePage:siTable:8:sioTable:1:siForm:text"]',
  lastName: '[id="ThePage:siTable:8:sioTable:2:siForm:text"]',
  title: '[id="ThePage:siTable:8:sioTable:3:siForm:text"]',
  email: '[id="ThePage:siTable:8:sioTable:4:siForm:text"]',
  phone: '[id="ThePage:siTable:8:sioTable:6:siForm:text"]',
  companyName: '[id="ThePage:siTable:8:sioTable:5:siForm:text"]',
  mobile: '[id="ThePage:siTable:8:sioTable:7:siForm:text"]',
  fax: '[id="ThePage:siTable:8:sioTable:8:siForm:text"]',
} as const;

/**
 * Coordinator question: "Is the dust control coordinator the same as the primary project contact?"
 *
 * siTable index varies by app type (observed: siTable:8, siTable:10).
 * Primary + fallback selectors handle both known layouts.
 */
export const coordinator = {
  yes: '[id="ThePage:siTable:10:sioTable:3:siForm:radioTable:0:radio"]',
  no: '[id="ThePage:siTable:10:sioTable:3:siForm:radioTable:1:radio"]',
  yesFallbacks: ['[id="ThePage:siTable:8:sioTable:0:siForm:radio"]'],
  noFallbacks: ['[id="ThePage:siTable:8:sioTable:1:siForm:radio"]'],
} as const;

/** siTable:11 - Project Info */
export const project = {
  name: '[id="ThePage:siTable:11:sioTable:0:siForm:text"]',
  description: '[id="ThePage:siTable:11:sioTable:1:siForm:textarea"]',
  startDate: '[id="ThePage:siTable:11:sioTable:2:siForm:date"]',
  endDate: '[id="ThePage:siTable:11:sioTable:3:siForm:date"]',
  /** siTable:13 - Estimated cubic yards of bulk material to import/export */
  bulkMaterialsCubicYards: '[id="ThePage:siTable:13:sioTable:0:siForm:text"]',
  /**
   * "Does project include demolition/renovation?"
   *
   * siTable index varies by app type (observed: siTable:10, siTable:16).
   * Primary + fallback selectors handle both known layouts.
   */
  hasDemolition: {
    yes: '[id="ThePage:siTable:16:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:16:sioTable:1:siForm:radio"]',
    yesFallbacks: ['[id="ThePage:siTable:10:sioTable:0:siForm:radio"]'],
    noFallbacks: ['[id="ThePage:siTable:10:sioTable:1:siForm:radio"]'],
  },
} as const;

/** Site location info - from page 2 siTable:12 */
export const site = {
  name: '[id="ThePage:siTable:12:sioTable:0:siForm:text"]',
  latitude: '[id="ThePage:siTable:12:locations:0:_idJsp204"]',
  longitude: '[id="ThePage:siTable:12:locations:0:_idJsp206"]',
  acresDisturbed: '[id="ThePage:siTable:12:_idJsp173"]',
} as const;

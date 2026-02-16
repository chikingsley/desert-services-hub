/**
 * Post-K Selectors - Water Requirements & Acres per Category
 *
 * These sections appear AFTER Category K with per-category water tier and acres.
 *
 * siTable:54 - B1 (Unpaved Staging Areas)
 * siTable:55 - B2 (Unpaved Haul Roads)
 * siTable:56 - C2 (Disturbed Surfaces - Active Operations)
 * siTable:57 - C3 (Disturbed Surfaces - Inactive Periods)
 * siTable:58 - F2 (Fine Grading)
 * siTable:59 - G1 (Underground Utilities)
 * siTable:60 - G2 (Vertical Structures)
 * siTable:61 - H (Demolition)
 * siTable:62 - I1 (During Weed Abatement)
 * siTable:63 - I2 (Stabilization following Weed Abatement)
 * siTable:64 - J (Blasting)
 * siTable:65 - D4 (Bulk Material Loading/Unloading)
 * siTable:66 - F1NovFeb (Mass Grading November-February)
 * siTable:67 - F1MarOct (Mass Grading March-October)
 */

/** Combined Post-K selectors matching FormData structure */
export const postK = {
  /** B.1 - Unpaved Staging Areas (siTable:54) */
  b1: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:54:sioTable:5:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:54:sioTable:3:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:54:sioTable:3:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:54:sioTable:3:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:54:sioTable:3:siForm:radioTable:3:radio"]',
    },
  },
  /** B.2 - Unpaved Haul Roads (siTable:55) */
  b2: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:55:sioTable:4:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:55:sioTable:3:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:55:sioTable:3:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:55:sioTable:3:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:55:sioTable:3:siForm:radioTable:3:radio"]',
    },
  },
  /** C.2 - Disturbed Surfaces Active Operations (siTable:56) */
  c2: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:56:sioTable:4:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:56:sioTable:3:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:56:sioTable:3:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:56:sioTable:3:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:56:sioTable:3:siForm:radioTable:3:radio"]',
    },
  },
  /** C.3 - Disturbed Surfaces Inactive Periods (siTable:57) */
  c3: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:57:sioTable:4:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:57:sioTable:3:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:57:sioTable:3:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:57:sioTable:3:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:57:sioTable:3:siForm:radioTable:3:radio"]',
    },
  },
  /** F.2 - Fine Grading (siTable:58) */
  f2: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:58:sioTable:2:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:58:sioTable:1:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:58:sioTable:1:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:58:sioTable:1:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:58:sioTable:1:siForm:radioTable:3:radio"]',
    },
  },
  /** G.1 - Underground Utilities (siTable:59) */
  g1: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:59:sioTable:2:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:59:sioTable:0:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:59:sioTable:0:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:59:sioTable:0:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:59:sioTable:0:siForm:radioTable:3:radio"]',
    },
  },
  /** G.2 - Vertical Structures (siTable:60) */
  g2: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:60:sioTable:2:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:60:sioTable:0:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:60:sioTable:0:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:60:sioTable:0:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:60:sioTable:0:siForm:radioTable:3:radio"]',
    },
  },
  /** H - Demolition (siTable:61) */
  h: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:61:sioTable:2:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:61:sioTable:0:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:61:sioTable:0:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:61:sioTable:0:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:61:sioTable:0:siForm:radioTable:3:radio"]',
    },
  },
  /** I.1 - During Weed Abatement (siTable:62) */
  i1: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:62:sioTable:2:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:62:sioTable:0:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:62:sioTable:0:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:62:sioTable:0:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:62:sioTable:0:siForm:radioTable:3:radio"]',
    },
  },
  /** I.2 - Stabilization Following Weed Abatement (siTable:63) */
  i2: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:63:sioTable:5:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:63:sioTable:0:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:63:sioTable:0:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:63:sioTable:0:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:63:sioTable:0:siForm:radioTable:3:radio"]',
    },
  },
  /** J - Blasting (siTable:64) */
  j: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:64:sioTable:2:siForm:text"]',
    waterTier: {
      "0-2": '[id="ThePage:siTable:64:sioTable:0:siForm:radioTable:0:radio"]',
      "2-10": '[id="ThePage:siTable:64:sioTable:0:siForm:radioTable:1:radio"]',
      "10-100":
        '[id="ThePage:siTable:64:sioTable:0:siForm:radioTable:2:radio"]',
      "100+": '[id="ThePage:siTable:64:sioTable:0:siForm:radioTable:3:radio"]',
    },
  },
  /** D.4 - Bulk Material Loading/Unloading (siTable:65) - different structure */
  d4: {
    cubicYardsExport: '[id="ThePage:siTable:65:sioTable:1:siForm:text"]',
    cubicYardsImport: '[id="ThePage:siTable:65:sioTable:0:siForm:text"]',
  },
  /** F.1 Nov-Feb - Mass Grading November-February (siTable:66) */
  f1NovFeb: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:66:sioTable:0:siForm:text"]',
  },
  /** F.1 Mar-Oct - Mass Grading March-October (siTable:67) */
  f1MarOct: {
    avgDailyDisturbedAcres: '[id="ThePage:siTable:67:sioTable:0:siForm:text"]',
  },
} as const;

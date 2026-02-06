/**
 * Category K Selectors - Water Supply
 *
 * siTable:50 - Soil texture ON-SITE
 * siTable:51 - Soil texture IMPORTED
 * siTable:52 - Water sources
 * siTable:53 - Water application methods
 */

/**
 * Category K - Water Supply
 */
export const categoryK = {
  /** Soil texture selections */
  soilTexture: {
    /** siTable:50 - Soil texture ON-SITE */
    onSite: {
      moderate: '[id="ThePage:siTable:50:sioTable:1:siForm:radio"]',
      severe: '[id="ThePage:siTable:50:sioTable:0:siForm:radio"]',
    },
    /** siTable:51 - Soil texture IMPORTED */
    imported: {
      moderate: '[id="ThePage:siTable:51:sioTable:1:siForm:radio"]',
      none: '[id="ThePage:siTable:51:sioTable:2:siForm:radio"]',
      severe: '[id="ThePage:siTable:51:sioTable:0:siForm:radio"]',
    },
  },
  /** siTable:52 - Water sources - FormData nests these under waterSources */
  waterSources: {
    meteredHydrant: {
      yes: '[id="ThePage:siTable:52:sioTable:0:siForm:checkbox"]',
      no: "",
    },
    meteredHydrantQty: '[id="ThePage:siTable:52:sioTable:7:siForm:text"]',
    meteredHydrantSize: '[id="ThePage:siTable:52:sioTable:8:siForm:text"]',
    waterTower: {
      yes: '[id="ThePage:siTable:52:sioTable:1:siForm:checkbox"]',
      no: "",
    },
    waterTowerQty: '[id="ThePage:siTable:52:sioTable:10:siForm:text"]',
    waterTowerSize: '[id="ThePage:siTable:52:sioTable:11:siForm:text"]',
    waterPond: {
      yes: '[id="ThePage:siTable:52:sioTable:2:siForm:checkbox"]',
      no: "",
    },
    waterPondQty: '[id="ThePage:siTable:52:sioTable:13:siForm:text"]',
    waterPondSize: '[id="ThePage:siTable:52:sioTable:14:siForm:text"]',
    offSite: {
      yes: '[id="ThePage:siTable:52:sioTable:3:siForm:checkbox"]',
      no: "",
    },
    offSiteQty: '[id="ThePage:siTable:52:sioTable:16:siForm:text"]',
    offSiteSize: '[id="ThePage:siTable:52:sioTable:17:siForm:text"]',
    hoseBib: {
      yes: '[id="ThePage:siTable:52:sioTable:4:siForm:checkbox"]',
      no: "",
    },
    hoseBibQty: '[id="ThePage:siTable:52:sioTable:19:siForm:text"]',
    hoseBibSize: '[id="ThePage:siTable:52:sioTable:20:siForm:text"]',
    other: {
      yes: '[id="ThePage:siTable:52:sioTable:5:siForm:checkbox"]',
      no: "",
    },
    otherQty: '[id="ThePage:siTable:52:sioTable:23:siForm:text"]',
    otherSize: '[id="ThePage:siTable:52:sioTable:24:siForm:text"]',
    otherDescription: '[id="ThePage:siTable:52:sioTable:22:siForm:textarea"]',
  },
  /** siTable:53 - Water application methods - FormData nests these under waterMethods */
  waterMethods: {
    hose: {
      yes: '[id="ThePage:siTable:53:sioTable:0:siForm:checkbox"]',
      no: "",
    },
    hoseQty: '[id="ThePage:siTable:53:sioTable:6:siForm:text"]',
    hoseSize: '[id="ThePage:siTable:53:sioTable:7:siForm:text"]',
    waterTruck: {
      yes: '[id="ThePage:siTable:53:sioTable:1:siForm:checkbox"]',
      no: "",
    },
    waterTruckQty: '[id="ThePage:siTable:53:sioTable:9:siForm:text"]',
    waterTruckSize: '[id="ThePage:siTable:53:sioTable:10:siForm:text"]',
    waterPull: {
      yes: '[id="ThePage:siTable:53:sioTable:2:siForm:checkbox"]',
      no: "",
    },
    waterPullQty: '[id="ThePage:siTable:53:sioTable:12:siForm:text"]',
    waterPullSize: '[id="ThePage:siTable:53:sioTable:13:siForm:text"]',
    waterBuffalo: {
      yes: '[id="ThePage:siTable:53:sioTable:3:siForm:checkbox"]',
      no: "",
    },
    waterBuffaloQty: '[id="ThePage:siTable:53:sioTable:15:siForm:text"]',
    waterBuffaloSize: '[id="ThePage:siTable:53:sioTable:16:siForm:text"]',
    other: {
      yes: '[id="ThePage:siTable:53:sioTable:4:siForm:checkbox"]',
      no: "",
    },
    otherQty: '[id="ThePage:siTable:53:sioTable:19:siForm:text"]',
    otherSize: '[id="ThePage:siTable:53:sioTable:20:siForm:text"]',
    otherDescription: '[id="ThePage:siTable:53:sioTable:18:siForm:textarea"]',
  },
} as const;

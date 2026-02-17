/**
 * Form Filling Types
 *
 * Single source of truth for all form-filling types:
 * - FormData interface (the contract for form filling)
 * - DEFAULTS object (all default values)
 * - Category types for Page 4
 * - Shared types (EntityType, ControlMeasure, etc.)
 *
 * @module src/form-filling/types
 */

import { z } from "zod";

// ============================================================================
// Shared Types
// ============================================================================

export const EntityTypeSchema = z.enum([
  "Association",
  "Business Trust",
  "Corporation",
  "General Partnership",
  "Government Entity",
  "Individual",
  "Limited Liability Company",
  "Limited Partnership",
  "Sole Proprietor",
]);

export type EntityType = z.infer<typeof EntityTypeSchema>;

export type ControlMeasure = "Primary" | "Contingency" | "None";
/** For fields where Primary is not allowed (e.g., B.2 ceaseOperations) */
export type ContingencyMeasure = "Contingency" | "None";
export type PaveWhen = "prior" | "during" | "end";
export type PreventAccessMethod =
  | "ditches"
  | "fences"
  | "berms"
  | "shrubs"
  | "trees"
  | "other";
export type TrackoutDeviceType =
  | "gravel_pad"
  | "grizzly"
  | "wheel_wash"
  | "paved_area"
  | "other";
export type SoilTextureOnSite = "moderate" | "severe";
export type SoilTextureImported = "moderate" | "severe" | "none";

// ============================================================================
// Date Helpers
// ============================================================================

export function today(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

export function oneYearFromNow(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

// ============================================================================
// FormData Interface
// ============================================================================

export interface FormData {
  // ===========================================================================
  // Page 1: Applicant Information (in form order)
  // ===========================================================================

  // siTable:1 - "Provide an email address where we can send the permit"
  permitContact: {
    email: string;
    name: string;
    phone: string;
  };

  // siTable:2 - "Did you receive a no-permit violation?"
  violation: {
    hasViolation: boolean;
    permitNumber?: string;
  };

  // siTable:4 - "Applicant" (relationship checkboxes + company info)
  applicant: {
    // Relationship to property (Check all that apply)
    isPropertyOwner: boolean;
    isDeveloper: boolean;
    isLessee: boolean;
    isGeneralContractor: boolean;
    // Company info
    entityType: EntityType;
    companyName: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email: string;
  };

  // siTable:5 - "Applicant President/Owner"
  presidentOwner: {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email: string;
  };

  // siTable:6 - "Is the Applicant a wholly owned subsidiary?"
  subsidiary: {
    isSubsidiary: boolean;
    parentEntityType?: EntityType;
    parentName?: string;
    parentAddress1?: string;
    parentAddress2?: string;
    parentCity?: string;
    parentState?: string;
    parentZip?: string;
    parentPhone?: string;
    parentEmail?: string;
    parentStateOfIncorporation?: string;
  };

  // siTable:7 - "Is the Applicant the Property Owner or Developer?"
  propertyOwner: {
    isDifferent: boolean;
    entityType?: EntityType;
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    fax?: string;
    contactFirstName?: string;
    contactLastName?: string;
    contactPhone?: string;
    contactEmail?: string;
  };

  // ===========================================================================
  // Page 3: Project Details
  // ===========================================================================

  // siTable:8 - "Primary Project Contact"
  primaryContact: {
    firstName: string;
    lastName: string;
    title: string;
    email: string;
    phone: string;
    companyName: string;
    mobile?: string;
    fax?: string;
  };

  project: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    bulkMaterialsCubicYards: number;
    hasDemolition: boolean;
  };

  site: {
    name: string;
    latitude: number | null;
    longitude: number | null;
    acresDisturbed: number;
  };

  // ===========================================================================
  // Page 4: Dust Control Plan - Categories A through K
  // ===========================================================================

  // Category A: Wind-Blown Dust (no yes/no, just checkboxes)
  categoryA: {
    soilCrust: boolean;
    tfv: boolean;
    vegetative: boolean;
    other: boolean;
    otherDescription: string;
  };

  // Category B.1: Unpaved Staging Areas
  categoryB1: {
    applies: boolean;
    pave: ControlMeasure;
    paveWhen: PaveWhen;
    gravel: ControlMeasure;
    water: ControlMeasure;
    dustSuppressants: ControlMeasure;
    dustSuppressantsFrequency: string;
    dustSuppressantsAmount: string;
    limitTrips: ControlMeasure;
    limitTripsMax: string;
    speedRestrictionMethod: string;
    other: ControlMeasure;
    otherDescription: string;
    avgDailyDisturbedAcres: number | null;
  };

  // Category B.2: Unpaved Access Roads
  categoryB2: {
    applies: boolean;
    pave: ControlMeasure;
    paveWhen: PaveWhen;
    gravel: ControlMeasure;
    water: ControlMeasure;
    dustSuppressants: ControlMeasure;
    dustSuppressantsFrequency: string;
    dustSuppressantsAmount: string;
    limitTrips: ControlMeasure;
    limitTripsMax: string;
    speedRestrictionMethod: string;
    ceaseOperations: ContingencyMeasure;
    ceaseOperationsAreaSpecification: string;
    other: ControlMeasure;
    otherDescription: string;
    avgDailyDisturbedAcres: number | null;
  };

  // Category C.1: Before/after daily construction (no yes/no, always required)
  categoryC1: {
    preWater: ControlMeasure;
    phaseWork: ControlMeasure;
    other: ControlMeasure;
    otherDescription: string;
  };

  // Category C.2: During active operations (no yes/no, always required)
  categoryC2: {
    visiblyMoist: ControlMeasure;
    astm: ControlMeasure;
    suppressants: ControlMeasure;
    windBarriers: ControlMeasure;
    other: ControlMeasure;
    suppressantFrequency: string;
    suppressantAmount: string;
    otherDescription: string;
  };

  // Category C.3: Inactive periods (no yes/no, always required)
  categoryC3: {
    applyWater: ControlMeasure;
    surfaceGravel: ControlMeasure;
    suppressants: ControlMeasure;
    suppressantFrequency: string;
    suppressantAmount: string;
    coverTarps: ControlMeasure;
    vegetative: ControlMeasure;
    other: ControlMeasure;
    otherDescription: string;
  };

  // Category C.4: Permanent stabilization (no yes/no, always required)
  categoryC4: {
    pave: ControlMeasure;
    paveWhen: PaveWhen;
    gravel: ControlMeasure;
    suppressants: ControlMeasure;
    vegetative: ControlMeasure;
    restrictAccess: ControlMeasure;
    applyWaterPrevent: ControlMeasure;
    preventAccess: ControlMeasure;
    restoreVegetation: ControlMeasure;
    other: ControlMeasure;
    otherDescription: string;
    suppressantFrequency: string;
    suppressantAmount: string;
    applyWaterPreventMethods: PreventAccessMethod[];
    applyWaterPreventOtherText: string;
    preventAccessMethods: PreventAccessMethod[];
    preventAccessOtherText: string;
  };

  // Category D.1: Materials Hauled FROM Site
  // NOTE: D.1 only allows Contingency/None (no Primary options in form)
  categoryD1: {
    applies: boolean;
    waterTopOfLoad: ContingencyMeasure;
    dustSuppressantsTopOfLoad: ContingencyMeasure;
    ceaseOperations: ContingencyMeasure;
    other: ContingencyMeasure;
    otherDescription: string;
  };

  // Category D.2: Materials Hauled WITHIN Site
  categoryD2: {
    applies: boolean;
    limitSpeed: ControlMeasure;
    waterTopOfLoad: ControlMeasure;
    dustSuppressantsTopOfLoad: ControlMeasure;
    coverTrucks: ControlMeasure;
    ceaseOperations: ContingencyMeasure;
    other: ControlMeasure;
    otherDescription: string;
  };

  // Category D.3: Materials Crossing Public Areas
  // NOTE: D.3 only allows Contingency/None (no Primary options in form)
  categoryD3: {
    applies: boolean;
    ceaseOperations: ContingencyMeasure;
    other: ContingencyMeasure;
    otherDescription: string;
  };

  // Category D.4: Loading/Unloading/Stacking
  categoryD4: {
    applies: boolean;
    ceaseOperations: ContingencyMeasure;
    water: ControlMeasure;
    dustSuppressants: ControlMeasure;
    suppressantFrequency: string;
    suppressantAmount: string;
    other: ControlMeasure;
    otherDescription: string;
  };

  // Category D.5: Open Storage Piles
  categoryD5: {
    applies: boolean;
    coverPiles: ControlMeasure;
    maintainMoisture: ControlMeasure;
    maintainCrust: ControlMeasure;
    windBarriers: ControlMeasure;
    other: ControlMeasure;
    otherDescription: string;
  };

  // Category E.1: Trackout Control Device
  // NOTE: E.1 control measures only allow Contingency/None (no Primary)
  categoryE1: {
    applies: boolean;
    deviceType: TrackoutDeviceType[];
    deviceTypeOther: string;
    ceaseOperations: ContingencyMeasure;
    other: ContingencyMeasure;
    otherDescription: string;
  };

  // Category E.2: Cleaning (no yes/no, always required)
  categoryE2: {
    streetSweeper: ControlMeasure;
    manuallySweep: ControlMeasure;
    other: ControlMeasure;
    otherDescription: string;
  };

  // Category F.1: Mass Grading
  categoryF1: {
    applies: boolean;
    avgDailyDisturbanceNovFeb: number | null;
    avgDailyDisturbanceMarOct: number | null;
  };

  // Category F.2: Fine Grading
  categoryF2: {
    applies: boolean;
  };

  // Category G.1: Underground Utilities
  categoryG1: {
    applies: boolean;
    avgDailyDisturbedAcres: number | null;
  };

  // Category G.2: Vertical Structures
  categoryG2: {
    applies: boolean;
    avgDailyDisturbedAcres: number | null;
  };

  // Category H: Demolition
  // NOTE: H control measures only allow Contingency/None (no Primary)
  categoryH: {
    applies: boolean;
    useDustSuppressants: boolean;
    suppressantFrequency: string;
    suppressantAmount: string;
    cleanDebris: ContingencyMeasure;
    other: ContingencyMeasure;
    otherDescription: string;
    avgDailyDisturbedAcres: number | null;
  };

  // Category I: Weed Abatement
  // NOTE: I.1 disturbance only allows Contingency/None (no Primary)
  // Category I.1: During Weed Abatement Disturbance
  categoryI1: {
    applies: boolean;
    ceaseOperations: ContingencyMeasure;
    other: ContingencyMeasure;
    otherDescription: string;
    avgDailyDisturbedAcres: number | null;
  };

  // Category I.2: Stabilization following Weed Abatement
  categoryI2: {
    pave: ControlMeasure;
    gravel: ControlMeasure;
    water: ControlMeasure;
    dustSuppressants: ControlMeasure;
    suppressantFrequency: string;
    suppressantAmount: string;
    vegetation: ControlMeasure;
    other: ControlMeasure;
    otherDescription: string;
  };

  // Category J: Blasting
  categoryJ: {
    applies: boolean;
    water: ControlMeasure;
    dustSuppressants: ControlMeasure;
    suppressantFrequency: string;
    suppressantAmount: string;
    other: ContingencyMeasure;
    otherDescription: string;
    avgDailyDisturbedAcres: number | null;
  };

  // Category K: Water Supply
  categoryK: {
    soilTexture: {
      onSite: SoilTextureOnSite;
      imported: SoilTextureImported;
    };
    waterSources: {
      meteredHydrant: boolean;
      meteredHydrantQty: number;
      meteredHydrantSize: string;
      waterTower: boolean;
      waterTowerQty: number;
      waterTowerSize: string;
      waterPond: boolean;
      waterPondQty: number;
      waterPondSize: string;
      offSite: boolean;
      offSiteQty: number;
      offSiteSize: string;
      hoseBib: boolean;
      hoseBibQty: number;
      hoseBibSize: string;
      other: boolean;
      otherQty: number;
      otherSize: string;
      otherDescription: string;
    };
    waterMethods: {
      hose: boolean;
      hoseQty: number;
      hoseSize: string;
      waterTruck: boolean;
      waterTruckQty: number;
      waterTruckSize: string;
      waterPull: boolean;
      waterPullQty: number;
      waterPullSize: string;
      waterBuffalo: boolean;
      waterBuffaloQty: number;
      waterBuffaloSize: string;
      other: boolean;
      otherQty: number;
      otherSize: string;
      otherDescription: string;
    };
  };

  // ===========================================================================
  // Page 4: Post-K Sections (Water Tier Requirements per Category)
  // ===========================================================================

  /**
   * Post-K sections appear after Category K and specify water requirements
   * per disturbed area tier for each applicable category.
   *
   * Each section has:
   * - waterTier: Which tier applies (0-2, 2-10, 10-100, 100+ acres)
   * - avgDailyDisturbedAcres: The average daily disturbed area
   */
  postK: {
    /** B.1 - Unpaved Staging Areas */
    b1: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** B.2 - Unpaved Haul/Access Roads */
    b2: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** C.2 - Disturbed Surfaces (During Active Operations) */
    c2: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** C.3 - Disturbed Surfaces (Inactive Periods) */
    c3: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** F.2 - Fine Grading */
    f2: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** G.1 - Underground Utilities */
    g1: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** G.2 - Vertical Structures */
    g2: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** H - Demolition */
    h: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** I.1 - During Weed Abatement */
    i1: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** I.2 - Stabilization Following Weed Abatement */
    i2: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** J - Blasting */
    j: {
      waterTier: "0-2" | "2-10" | "10-100" | "100+";
      avgDailyDisturbedAcres: number | null;
    };
    /** D.4 - Bulk Material Loading/Unloading (cubic yards, not water tier) */
    d4: {
      cubicYardsImport: number | null;
      cubicYardsExport: number | null;
    };
    /** F.1 Nov-Feb - Mass Grading November-February (siTable:66) - acres only, no water tier selector */
    f1NovFeb: {
      avgDailyDisturbedAcres: number | null;
    };
    /** F.1 Mar-Oct - Mass Grading March-October (siTable:67) - acres only, no water tier selector */
    f1MarOct: {
      avgDailyDisturbedAcres: number | null;
    };
  };

  // ===========================================================================
  // Page 5: Submit Application
  // ===========================================================================

  page5: {
    /** Accelerated Processing checkbox - expedited permit processing (extra fee) */
    acceleratedProcessing: boolean;
  };

  // ===========================================================================
  // Payment (Point & Pay pages 1-2, after submit redirect)
  // ===========================================================================

  payment: {
    card: {
      nameOnCard: string;
      cardNumber: string;
      expiryMonth: string;
      expiryYear: string;
      cvv: string;
    };
    billing: {
      firstName: string;
      lastName: string;
      addressLine1: string;
      addressLine2?: string;
      country: string;
      city: string;
      state: string;
      postalCode: string;
      email: string;
      phone: string;
    };
  };

  // ===========================================================================
  // Metadata
  // ===========================================================================

  _meta: {
    companyInDatabase: boolean;
    skipApplicantSection: boolean;
    noiPermitId: string | null;
    ltfNumber: string | null;
    extractionSource: "noi+plan" | "noi-only" | "manual" | "test";
  };
}

// ============================================================================
// Selector Type Generation - Auto-maps FormData structure to selectors
// ============================================================================

/**
 * Maps a FormData type to its corresponding selector structure.
 *
 * - ControlMeasure fields → Record<ControlMeasure, string>
 * - string fields → string
 * - boolean fields → { yes: string, no: string } (Yes/No radio selectors)
 * - number fields → string (input selector)
 * - Arrays of string unions → Record<Union, string> (map each option to selector)
 * - Objects → recursive mapping
 */
type SelectorFor<T> = [NonNullable<T>] extends [
  "Primary" | "Contingency" | "None",
] // ControlMeasure union
  ? Record<NonNullable<T> & string, string>
  : [NonNullable<T>] extends [string]
    ? string extends NonNullable<T> // Generic string (text fields)
      ? string // Single selector string
      : Record<NonNullable<T> & string, string> // Specific string union → options map
    : [NonNullable<T>] extends [boolean]
      ? { yes: string; no: string } // Boolean field → Yes/No radio selectors
      : [NonNullable<T>] extends [number]
        ? string // Number field → single input selector
        : T extends readonly (infer U)[] | (infer U)[] // Handle arrays (readonly or mutable)
          ? [NonNullable<U>] extends [string]
            ? string extends NonNullable<U>
              ? string // Generic string array → single selector
              : Record<NonNullable<U> & string, string> // String union array → Record mapping each to selector
            : never
          : T extends object
            ? { [K in keyof T]-?: SelectorFor<T[K]> } // Recurse for nested objects, removing optionality
            : never;

/**
 * Auto-generated selector map that mirrors FormData structure.
 * This type is derived from FormData, so it stays in sync automatically.
 *
 * SelectorFallbacks adds optional *Fallbacks arrays for fields with known
 * index drift in ADF forms. These aren't form fields - just implementation
 * details for resilient selector discovery.
 */
interface SelectorFallbacks {
  categoryC4: {
    otherDescriptionFallbacks?: readonly string[];
    suppressantFrequencyFallbacks?: readonly string[];
    suppressantAmountFallbacks?: readonly string[];
    paveWhenFallbacks?: {
      prior?: readonly string[];
      during?: readonly string[];
      end?: readonly string[];
    };
  };
  categoryD2: {
    otherDescriptionFallbacks?: readonly string[];
    suppressantFrequencyFallbacks?: readonly string[];
    suppressantAmountFallbacks?: readonly string[];
  };
  categoryD4: {
    otherDescriptionFallbacks?: readonly string[];
    suppressantFrequencyFallbacks?: readonly string[];
    suppressantAmountFallbacks?: readonly string[];
  };
  categoryI2: {
    suppressantFrequencyFallbacks?: readonly string[];
    suppressantAmountFallbacks?: readonly string[];
    otherDescriptionFallbacks?: readonly string[];
  };
}

export type SelectorMap = SelectorFor<FormData> & SelectorFallbacks;

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULTS: FormData = {
  // Page 1 (in form order)
  permitContact: {
    email: "chi@desertservices.net",
    name: "Chi Ejimofor",
    phone: "(304) 405-2446",
  },

  violation: {
    hasViolation: false,
  },

  applicant: {
    address1: "",
    city: "",
    companyName: "",
    email: "",
    entityType: "Corporation",
    isDeveloper: true,
    isGeneralContractor: true,
    isLessee: false,
    isPropertyOwner: false,
    phone: "",
    state: "",
    zip: "",
  },

  presidentOwner: {
    address1: "",
    city: "",
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    state: "",
    zip: "",
  },

  subsidiary: {
    isSubsidiary: false,
  },

  propertyOwner: {
    isDifferent: false,
  },

  // Page 3
  primaryContact: {
    companyName: "",
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    title: "",
  },

  project: {
    bulkMaterialsCubicYards: 0,
    description: "new construction",
    endDate: oneYearFromNow(),
    hasDemolition: false,
    name: "",
    startDate: today(),
  },

  site: {
    acresDisturbed: 1,
    latitude: null,
    longitude: null,
    name: "",
  },

  // Page 4
  categoryA: {
    other: false,
    otherDescription: "",
    soilCrust: true,
    tfv: false,
    vegetative: false,
  },

  categoryB1: {
    applies: true,
    avgDailyDisturbedAcres: null,
    dustSuppressants: "None",
    dustSuppressantsAmount: "",
    dustSuppressantsFrequency: "",
    gravel: "None",
    limitTrips: "None",
    limitTripsMax: "",
    other: "None",
    otherDescription: "",
    pave: "Contingency",
    paveWhen: "during",
    speedRestrictionMethod: "",
    water: "Primary",
  },

  categoryB2: {
    applies: true,
    avgDailyDisturbedAcres: null,
    ceaseOperations: "Contingency",
    ceaseOperationsAreaSpecification: "",
    dustSuppressants: "None",
    dustSuppressantsAmount: "",
    dustSuppressantsFrequency: "",
    gravel: "None",
    limitTrips: "None",
    limitTripsMax: "",
    other: "None",
    otherDescription: "",
    pave: "Contingency",
    paveWhen: "during",
    speedRestrictionMethod: "",
    water: "Primary",
  },

  categoryC1: {
    other: "None",
    otherDescription: "",
    phaseWork: "Contingency",
    preWater: "Primary",
  },
  categoryC2: {
    astm: "Contingency",
    other: "None",
    otherDescription: "",
    suppressantAmount: "",
    suppressantFrequency: "",
    suppressants: "None",
    visiblyMoist: "Primary",
    windBarriers: "None",
  },
  categoryC3: {
    applyWater: "Primary",
    coverTarps: "Contingency",
    other: "None",
    otherDescription: "",
    suppressantAmount: "",
    suppressantFrequency: "",
    suppressants: "None",
    surfaceGravel: "Contingency",
    vegetative: "None",
  },
  categoryC4: {
    applyWaterPrevent: "Primary",
    applyWaterPreventMethods: ["ditches", "fences", "berms", "shrubs", "trees"],
    applyWaterPreventOtherText: "",
    gravel: "Contingency",
    other: "None",
    otherDescription: "",
    pave: "Contingency",
    paveWhen: "during",
    preventAccess: "None",
    preventAccessMethods: [],
    preventAccessOtherText: "",
    restoreVegetation: "Contingency",
    restrictAccess: "Contingency",
    suppressantAmount: "100 gallons",
    suppressantFrequency: "Daily",
    suppressants: "None",
    vegetative: "None",
  },

  categoryD1: {
    applies: false,
    ceaseOperations: "Contingency",
    dustSuppressantsTopOfLoad: "None",
    other: "None",
    otherDescription: "",
    waterTopOfLoad: "Contingency",
  },

  categoryD2: {
    applies: true,
    ceaseOperations: "Contingency",
    coverTrucks: "Contingency",
    dustSuppressantsTopOfLoad: "None",
    limitSpeed: "Primary",
    other: "None",
    otherDescription: "",
    waterTopOfLoad: "Primary",
  },

  categoryD3: {
    applies: false,
    ceaseOperations: "Contingency",
    other: "None",
    otherDescription: "",
  },

  categoryD4: {
    applies: true,
    ceaseOperations: "Contingency",
    dustSuppressants: "None",
    other: "None",
    otherDescription: "",
    suppressantAmount: "",
    suppressantFrequency: "",
    water: "Primary",
  },

  categoryD5: {
    applies: false,
    coverPiles: "Primary",
    maintainCrust: "None",
    maintainMoisture: "Contingency",
    other: "None",
    otherDescription: "",
    windBarriers: "Contingency",
  },

  categoryE1: {
    applies: false,
    ceaseOperations: "Contingency",
    deviceType: ["gravel_pad"],
    deviceTypeOther: "",
    other: "None",
    otherDescription: "",
  },

  categoryE2: {
    manuallySweep: "Primary",
    other: "None",
    otherDescription: "",
    streetSweeper: "Contingency",
  },

  categoryF1: {
    applies: true,
    avgDailyDisturbanceMarOct: null,
    avgDailyDisturbanceNovFeb: null,
  },

  categoryF2: {
    applies: true,
  },

  categoryG1: {
    applies: false,
    avgDailyDisturbedAcres: null,
  },

  categoryG2: {
    applies: true,
    avgDailyDisturbedAcres: null,
  },

  categoryH: {
    applies: false,
    avgDailyDisturbedAcres: null,
    cleanDebris: "Contingency",
    other: "None",
    otherDescription: "",
    suppressantAmount: "",
    suppressantFrequency: "",
    useDustSuppressants: false,
  },

  categoryI1: {
    applies: false,
    avgDailyDisturbedAcres: null,
    ceaseOperations: "Contingency",
    other: "None",
    otherDescription: "",
  },
  categoryI2: {
    dustSuppressants: "None",
    gravel: "Contingency",
    other: "None",
    otherDescription: "",
    pave: "None",
    suppressantAmount: "",
    suppressantFrequency: "",
    vegetation: "None",
    water: "Primary",
  },

  categoryJ: {
    applies: false,
    avgDailyDisturbedAcres: null,
    dustSuppressants: "None",
    other: "None",
    otherDescription: "",
    suppressantAmount: "",
    suppressantFrequency: "",
    water: "Primary",
  },

  categoryK: {
    soilTexture: {
      onSite: "moderate",
      imported: "none",
    },
    waterMethods: {
      hose: false,
      hoseQty: 1,
      hoseSize: "5/8\" x 50'",
      waterTruck: true,
      waterTruckQty: 1,
      waterTruckSize: "4,000 gallons",
      waterPull: false,
      waterPullQty: 1,
      waterPullSize: "1,000 gallons",
      waterBuffalo: false,
      waterBuffaloQty: 1,
      waterBuffaloSize: "1,000 gallons",
      other: false,
      otherQty: 1,
      otherSize: "",
      otherDescription: "",
    },
    waterSources: {
      meteredHydrant: true,
      meteredHydrantQty: 1,
      meteredHydrantSize: '2" meter',
      waterTower: false,
      waterTowerQty: 1,
      waterTowerSize: "10,000 gallons",
      waterPond: false,
      waterPondQty: 1,
      waterPondSize: "Site-specific",
      offSite: false,
      offSiteQty: 1,
      offSiteSize: "N/A",
      hoseBib: false,
      hoseBibQty: 1,
      hoseBibSize: '3/4" connection',
      other: false,
      otherQty: 1,
      otherSize: "",
      otherDescription: "",
    },
  },

  // Post-K water tier sections (default to 10-100 tier)
  postK: {
    b1: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    b2: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    c2: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    c3: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    d4: { cubicYardsImport: null, cubicYardsExport: null },
    f1MarOct: { avgDailyDisturbedAcres: null },
    f1NovFeb: { avgDailyDisturbedAcres: null },
    f2: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    g1: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    g2: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    h: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    i1: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    i2: { waterTier: "10-100", avgDailyDisturbedAcres: null },
    j: { waterTier: "10-100", avgDailyDisturbedAcres: null },
  },

  // Page 5
  page5: {
    acceleratedProcessing: false,
  },

  // Payment (Point & Pay) — populated from PAYMENT_* env vars
  payment: {
    card: {
      nameOnCard: process.env.PAYMENT_CARD_NAME ?? "",
      cardNumber: process.env.PAYMENT_CARD_NUMBER ?? "",
      expiryMonth: process.env.PAYMENT_CARD_EXPIRY_MONTH ?? "",
      expiryYear: process.env.PAYMENT_CARD_EXPIRY_YEAR ?? "",
      cvv: process.env.PAYMENT_CARD_CVV ?? "",
    },
    billing: {
      firstName: process.env.PAYMENT_BILLING_FIRST_NAME ?? "",
      lastName: process.env.PAYMENT_BILLING_LAST_NAME ?? "",
      addressLine1: process.env.PAYMENT_BILLING_ADDRESS1 ?? "",
      addressLine2: process.env.PAYMENT_BILLING_ADDRESS2 || undefined,
      country: process.env.PAYMENT_BILLING_COUNTRY || "United States",
      city: process.env.PAYMENT_BILLING_CITY ?? "",
      state: process.env.PAYMENT_BILLING_STATE ?? "",
      postalCode: process.env.PAYMENT_BILLING_ZIP ?? "",
      email: process.env.PAYMENT_BILLING_EMAIL ?? "",
      phone: process.env.PAYMENT_BILLING_PHONE ?? "",
    },
  },

  _meta: {
    companyInDatabase: false,
    extractionSource: "manual",
    ltfNumber: null,
    noiPermitId: null,
    skipApplicantSection: false,
  },
};

// ============================================================================
// Deep Merge Utility
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function isObject(item: unknown): item is Record<string, unknown> {
  return typeof item === "object" && item !== null && !Array.isArray(item);
}

function deepMergeImpl(
  target: Record<string, unknown>,
  ...sources: (Record<string, unknown> | undefined)[]
): Record<string, unknown> {
  const result = { ...target };

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (isObject(sourceValue) && isObject(targetValue)) {
        result[key] = deepMergeImpl(targetValue, sourceValue);
      } else if (isObject(sourceValue)) {
        // Deep copy object values even when target doesn't have the key,
        // so mutations to the result don't corrupt the source (e.g. DEFAULTS)
        result[key] = deepMergeImpl({}, sourceValue);
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

export function deepMerge(
  target: FormData,
  ...sources: (DeepPartial<FormData> | undefined)[]
): FormData {
  return deepMergeImpl(
    target as unknown as Record<string, unknown>,
    ...(sources as (Record<string, unknown> | undefined)[])
  ) as unknown as FormData;
}

// ============================================================================
// Water Tier Derivation
// ============================================================================

export type WaterTier = "0-2" | "2-10" | "10-100" | "100+";

export function getWaterTier(acres: number): WaterTier {
  if (acres <= 2) {
    return "0-2";
  }
  if (acres <= 10) {
    return "2-10";
  }
  if (acres <= 100) {
    return "10-100";
  }
  return "100+";
}

// ============================================================================
// Post-K Reconciliation
// ============================================================================

/**
 * Resolve acreage with priority chain:
 * 1. Explicit postK value (if non-null)
 * 2. Category-specific acreage (if non-null)
 * 3. site.acresDisturbed fallback (if > 0)
 */
function resolveAcres(
  postKAcres: number | null,
  categoryAcres: number | null | undefined,
  siteAcres: number
): number | null {
  if (postKAcres !== null) {
    return postKAcres;
  }
  if (categoryAcres !== null && categoryAcres !== undefined) {
    return categoryAcres;
  }
  return siteAcres > 0 ? siteAcres : null;
}

/**
 * Reconcile a standard water-tier postK section.
 * If active: resolve acreage and derive waterTier.
 * If inactive: null out acreage (waterTier left as-is since it's meaningless).
 */
function reconcileWaterTierSection(
  section: { waterTier: WaterTier; avgDailyDisturbedAcres: number | null },
  isActive: boolean,
  categoryAcres: number | null | undefined,
  siteAcres: number
): void {
  if (!isActive) {
    section.avgDailyDisturbedAcres = null;
    return;
  }
  const acres = resolveAcres(
    section.avgDailyDisturbedAcres,
    categoryAcres,
    siteAcres
  );
  section.avgDailyDisturbedAcres = acres;
  if (acres !== null) {
    section.waterTier = getWaterTier(acres);
  }
}

/**
 * Enforce logical consistency between categories and post-K sections.
 *
 * Rules:
 * - If a category doesn't apply, its postK section can't have data
 * - If a category applies but has no explicit acreage, fall back to site.acresDisturbed
 * - Water tier is always derived from acreage, never set independently
 * - "Always-on" categories (C2, C3, I2) always get postK data
 *
 * Mutates data in place.
 */
function reconcilePostK(data: FormData): void {
  const siteAcres = data.site.acresDisturbed;

  // B1, B2 - conditional, have category acreage
  reconcileWaterTierSection(
    data.postK.b1,
    data.categoryB1.applies,
    data.categoryB1.avgDailyDisturbedAcres,
    siteAcres
  );
  reconcileWaterTierSection(
    data.postK.b2,
    data.categoryB2.applies,
    data.categoryB2.avgDailyDisturbedAcres,
    siteAcres
  );

  // C2, C3 - always on, no category acreage
  reconcileWaterTierSection(data.postK.c2, true, undefined, siteAcres);
  reconcileWaterTierSection(data.postK.c3, true, undefined, siteAcres);

  // F2 - conditional, no category acreage
  reconcileWaterTierSection(
    data.postK.f2,
    data.categoryF2.applies,
    undefined,
    siteAcres
  );

  // G1, G2 - conditional, have category acreage
  reconcileWaterTierSection(
    data.postK.g1,
    data.categoryG1.applies,
    data.categoryG1.avgDailyDisturbedAcres,
    siteAcres
  );
  reconcileWaterTierSection(
    data.postK.g2,
    data.categoryG2.applies,
    data.categoryG2.avgDailyDisturbedAcres,
    siteAcres
  );

  // H - conditional, has category acreage
  reconcileWaterTierSection(
    data.postK.h,
    data.categoryH.applies,
    data.categoryH.avgDailyDisturbedAcres,
    siteAcres
  );

  // I1 - conditional, has category acreage
  reconcileWaterTierSection(
    data.postK.i1,
    data.categoryI1.applies,
    data.categoryI1.avgDailyDisturbedAcres,
    siteAcres
  );

  // I2 - always on, no category acreage
  reconcileWaterTierSection(data.postK.i2, true, undefined, siteAcres);

  // J - conditional, has category acreage
  reconcileWaterTierSection(
    data.postK.j,
    data.categoryJ.applies,
    data.categoryJ.avgDailyDisturbedAcres,
    siteAcres
  );

  // D4 - required Post-K fields when category applies.
  // Legacy shape stores the second field as `cubicYardsExport`, but the portal
  // label is "Number of Days of Importing/Exporting Operations".
  if (data.categoryD4.applies) {
    if (data.postK.d4.cubicYardsImport === null) {
      data.postK.d4.cubicYardsImport = 20;
    }
    if (data.postK.d4.cubicYardsExport === null) {
      data.postK.d4.cubicYardsExport = 20;
    }
  } else {
    data.postK.d4.cubicYardsImport = null;
    data.postK.d4.cubicYardsExport = null;
  }

  // F1 NovFeb / MarOct - acres only, no water tier selector
  if (data.categoryF1.applies) {
    data.postK.f1NovFeb.avgDailyDisturbedAcres = resolveAcres(
      data.postK.f1NovFeb.avgDailyDisturbedAcres,
      data.categoryF1.avgDailyDisturbanceNovFeb,
      siteAcres
    );
    data.postK.f1MarOct.avgDailyDisturbedAcres = resolveAcres(
      data.postK.f1MarOct.avgDailyDisturbedAcres,
      data.categoryF1.avgDailyDisturbanceMarOct,
      siteAcres
    );
  } else {
    data.postK.f1NovFeb.avgDailyDisturbedAcres = null;
    data.postK.f1MarOct.avgDailyDisturbedAcres = null;
  }
}

// ============================================================================
// Build FormData - Merge defaults with overrides
// ============================================================================

export interface BuildFormDataInput {
  overrides?: DeepPartial<FormData>;
}

export function buildFormData(input?: BuildFormDataInput): FormData {
  let result = deepMerge({} as FormData, DEFAULTS);

  if (input?.overrides) {
    result = deepMerge(result, input.overrides);
  }

  reconcilePostK(result);

  return result;
}

// ============================================================================
// Page State Types (for validation/resume)
// ============================================================================

export interface Page1State {
  permitContact: {
    hasEmail: boolean;
    hasName: boolean;
    hasPhone: boolean;
  };
  violation: {
    hasAnswer: boolean;
    hasPermitNumber: boolean;
  };
  applicant: {
    // Relationship checkboxes
    propertyOwnerChecked: boolean;
    generalContractorChecked: boolean;
    developerChecked: boolean;
    lesseeChecked: boolean;
    // Company info
    hasEntityType: boolean;
    hasCompanyName: boolean;
    hasAddress1: boolean;
    hasAddress2: boolean;
    hasCity: boolean;
    hasState: boolean;
    hasZip: boolean;
    hasPhone: boolean;
    hasEmail: boolean;
  };
  presidentOwner: {
    hasFirstName: boolean;
    hasLastName: boolean;
    hasAddress1: boolean;
    hasAddress2: boolean;
    hasCity: boolean;
    hasState: boolean;
    hasZip: boolean;
    hasPhone: boolean;
    hasEmail: boolean;
  };
  subsidiary: {
    hasAnswer: boolean;
    hasParentEntityType: boolean;
    hasParentName: boolean;
    hasParentAddress1: boolean;
    hasParentAddress2: boolean;
    hasParentCity: boolean;
    hasParentState: boolean;
    hasParentZip: boolean;
    hasParentPhone: boolean;
    hasParentEmail: boolean;
    hasParentStateOfIncorporation: boolean;
  };
  propertyOwner: {
    hasAnswer: boolean;
    hasEntityType: boolean;
    hasName: boolean;
    hasAddress1: boolean;
    hasAddress2: boolean;
    hasCity: boolean;
    hasState: boolean;
    hasZip: boolean;
    hasPhone: boolean;
    hasFax: boolean;
    hasContactFirstName: boolean;
    hasContactLastName: boolean;
    hasContactPhone: boolean;
    hasContactEmail: boolean;
  };
}

export interface Page3State {
  contact: {
    hasFirstName: boolean;
    hasLastName: boolean;
    hasTitle: boolean;
    hasEmail: boolean;
    hasCompanyName: boolean;
    hasOnSitePhone: boolean;
    hasMobile: boolean;
  };
  project: {
    hasName: boolean;
    hasDescription: boolean;
    hasStartDate: boolean;
    hasEndDate: boolean;
  };
  specs: {
    hasBulkMaterialCubicYards: boolean;
    hasDemolitionAnswer: boolean;
  };
}

/**
 * State captured from Page 4 (Dust Control Plan) for verification.
 *
 * Page 4 has many categories (A-K). This state captures key indicators
 * that the page was filled correctly.
 */
export interface Page4State {
  /** Category A (wind-blown) section has an answer */
  categoryA: {
    hasAnswer: boolean;
  };
  /** Category B1 (Unpaved Staging Areas) */
  categoryB1: {
    applies: boolean;
    hasPave: boolean;
    hasPaveWhen: boolean; // conditional: when pave is Primary or Contingency
    hasGravel: boolean;
    hasWater: boolean;
    hasDustSuppressants: boolean;
    hasSuppressantFrequency: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasSuppressantAmount: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasLimitTrips: boolean;
    hasLimitTripsMax: boolean; // conditional: when limit trips is Primary or Contingency
    hasSpeedRestrictionMethod: boolean; // conditional: when limit trips is Primary or Contingency
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category B2 (Unpaved Access Roads) */
  categoryB2: {
    applies: boolean;
    hasPave: boolean;
    hasPaveWhen: boolean; // conditional: when pave is Primary or Contingency
    hasGravel: boolean;
    hasWater: boolean;
    hasDustSuppressants: boolean;
    hasSuppressantFrequency: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasSuppressantAmount: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasLimitTrips: boolean;
    hasLimitTripsMax: boolean; // conditional: when limit trips is Primary or Contingency
    hasSpeedRestrictionMethod: boolean; // conditional: when limit trips is Primary or Contingency
    hasCeaseOperations: boolean;
    hasCeaseOperationsAreaSpecification: boolean; // conditional: when cease operations is Contingency
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category C1 (Before/after daily construction) */
  categoryC1: {
    hasPreWater: boolean;
    hasPhaseWork: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category C2 (During active operations) */
  categoryC2: {
    hasVisiblyMoist: boolean;
    hasAstm: boolean;
    hasSuppressants: boolean;
    hasSuppressantFrequency: boolean; // conditional: when suppressants is Primary or Contingency
    hasSuppressantAmount: boolean; // conditional: when suppressants is Primary or Contingency
    hasWindBarriers: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category C3 (Inactive periods) */
  categoryC3: {
    hasApplyWater: boolean;
    hasSurfaceGravel: boolean;
    hasSuppressants: boolean;
    hasSuppressantFrequency: boolean; // conditional: when suppressants is Primary or Contingency
    hasSuppressantAmount: boolean; // conditional: when suppressants is Primary or Contingency
    hasCoverTarps: boolean;
    hasVegetative: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category C4 (Permanent stabilization) */
  categoryC4: {
    hasPave: boolean;
    hasPaveWhen: boolean; // conditional: when pave is Primary or Contingency
    hasGravel: boolean;
    hasSuppressants: boolean;
    hasSuppressantFrequency: boolean; // conditional: when suppressants is Primary or Contingency
    hasSuppressantAmount: boolean; // conditional: when suppressants is Primary or Contingency
    hasVegetative: boolean;
    hasRestrictAccess: boolean;
    hasApplyWaterPrevent: boolean;
    hasApplyWaterPreventMethods: boolean; // conditional: when applyWaterPrevent is Primary or Contingency
    hasApplyWaterPreventOtherText: boolean; // conditional: when applyWaterPrevent methods includes "other"
    hasPreventAccess: boolean;
    hasPreventAccessMethods: boolean; // conditional: when preventAccess is Primary or Contingency
    hasPreventAccessOtherText: boolean; // conditional: when preventAccess methods includes "other"
    hasRestoreVegetation: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category D1 (Materials Hauled FROM Site) */
  categoryD1: {
    applies: boolean;
    hasApplyWaterTop: boolean;
    hasApplyDustSuppressants: boolean;
    hasCeaseOperations: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Contingency
  };
  /** Category D2 (Materials Hauled WITHIN Site) */
  categoryD2: {
    applies: boolean;
    hasLimitSpeed: boolean;
    hasApplyWaterTop: boolean;
    hasApplyDustSuppressants: boolean;
    hasCoverHaulTrucks: boolean;
    hasCeaseOperations: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category D3 (Materials Hauled Crossing Public Areas) */
  categoryD3: {
    applies: boolean;
    hasCeaseOperations: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Contingency
  };
  /** Category D4 (Loading, Unloading, Stacking) */
  categoryD4: {
    applies: boolean;
    hasApplyWater: boolean;
    hasApplyDustSuppressants: boolean;
    hasSuppressantFrequency: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasSuppressantAmount: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasCeaseOperations: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category D5 (Open Storage Piles) */
  categoryD5: {
    applies: boolean;
    hasCoverPiles: boolean;
    hasMaintainMoisture: boolean;
    hasMaintainCrust: boolean;
    hasWindBarriers: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category E1 (Trackout Control) */
  categoryE1: {
    applies: boolean;
    hasDeviceType: boolean; // any device checkbox checked
    hasDeviceTypeOtherText: boolean; // conditional: when deviceType includes "other"
    hasCeaseOperations: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Contingency
  };
  /** Category E2 (Spillage Cleaning) */
  categoryE2: {
    hasStreetSweeper: boolean;
    hasManualSweep: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category F1 (Mass Grading) */
  categoryF1: {
    applies: boolean;
  };
  /** Category F2 (Fine Grading) */
  categoryF2: {
    applies: boolean;
  };
  /** Category G1 (Underground Utilities) */
  categoryG1: {
    applies: boolean;
  };
  /** Category G2 (Vertical Construction) */
  categoryG2: {
    applies: boolean;
  };
  /** Category H (Demolition) */
  categoryH: {
    applies: boolean;
    hasUseDustSuppressants: boolean;
    hasSuppressantFrequency: boolean; // conditional: when useDustSuppressants is checked
    hasSuppressantAmount: boolean; // conditional: when useDustSuppressants is checked
    hasCleanDebris: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Contingency
  };
  /** Category I1 (During Weed Abatement Disturbance) */
  categoryI1: {
    applies: boolean;
    hasCeaseOperations: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Contingency
  };
  /** Category I2 (Stabilization following Weed Abatement) */
  categoryI2: {
    hasPave: boolean;
    hasGravel: boolean;
    hasWater: boolean;
    hasDustSuppressants: boolean;
    hasSuppressantFrequency: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasSuppressantAmount: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasVegetation: boolean;
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Primary or Contingency
  };
  /** Category J (Blasting) */
  categoryJ: {
    applies: boolean;
    hasWater: boolean;
    hasDustSuppressants: boolean;
    hasSuppressantFrequency: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasSuppressantAmount: boolean; // conditional: when dust suppressants is Primary or Contingency
    hasOther: boolean;
    hasOtherDescription: boolean; // conditional: when other is Contingency
  };
  /** Category K (water supply) section was filled */
  categoryK: {
    hasSoilTextureOnSite: boolean;
    hasSoilTextureImported: boolean;
    hasWaterSource: boolean;
    hasWaterMethod: boolean;
    // Water sources - individual qty/size checks
    hasMeteredHydrantQty: boolean;
    hasMeteredHydrantSize: boolean;
    hasWaterTowerQty: boolean;
    hasWaterTowerSize: boolean;
    hasWaterPondQty: boolean;
    hasWaterPondSize: boolean;
    hasOffSiteQty: boolean;
    hasOffSiteSize: boolean;
    hasHoseBibQty: boolean;
    hasHoseBibSize: boolean;
    hasOtherSourceQty: boolean;
    hasOtherSourceSize: boolean;
    // Water methods - individual qty/size checks
    hasHoseQty: boolean;
    hasHoseSize: boolean;
    hasWaterTruckQty: boolean;
    hasWaterTruckSize: boolean;
    hasWaterPullQty: boolean;
    hasWaterPullSize: boolean;
    hasWaterBuffaloQty: boolean;
    hasWaterBuffaloSize: boolean;
    hasOtherMethodQty: boolean;
    hasOtherMethodSize: boolean;
  };
  /** Post-K sections (Water Requirements & Acres per Category) */
  postK: {
    b1: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    b2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    c2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    c3: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    f1NovFeb: { hasAvgDailyAcres: boolean };
    f1MarOct: { hasAvgDailyAcres: boolean };
    f2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    g1: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    g2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    h: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    i1: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    i2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    j: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
    d4: { hasCubicYardsImport: boolean; hasCubicYardsExport: boolean };
  };
  /** Total disturbed acres was entered */
  hasTotalDisturbedAcres: boolean;
}

/**
 * State captured from Page 5 (Review & Submit) for verification.
 */
export interface Page5State {
  /** Submit button is visible and page is ready */
  hasSubmitButton: boolean;
  /** Current page number (should be 5) */
  pageNumber: number;
}

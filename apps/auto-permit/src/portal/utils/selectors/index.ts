/**
 * Selectors Index - Type-Safe Selector System
 *
 * Combines all page/category selectors into a single `selectors` object
 * that is type-checked against FormData via SelectorMap.
 *
 * Portal selectors (navigation, workflow) are separate and NOT type-checked
 * against FormData since they're not form fields.
 */

import type { SelectorMap } from "@/form-data";
// Category selectors
import { categoryA } from "./category-a";
import { categoryB1, categoryB2 } from "./category-b";
import { categoryC1, categoryC2, categoryC3, categoryC4 } from "./category-c";
import {
  categoryD1,
  categoryD2,
  categoryD3,
  categoryD4,
  categoryD5,
} from "./category-d";
import { categoryE1, categoryE2 } from "./category-e";
import { categoryF1, categoryF2 } from "./category-f";
import { categoryG1, categoryG2 } from "./category-g";
import { categoryH } from "./category-h";
import { categoryI1, categoryI2 } from "./category-i";
import { categoryJ } from "./category-j";
import { categoryK } from "./category-k";
// Page selectors
import {
  applicant,
  permitContact,
  presidentOwner,
  propertyOwner,
  subsidiary,
  violation,
} from "./page1";
import { primaryContact, project, site } from "./page3";
import { page5 } from "./page5";
import { postK } from "./post-k";

export { esriMap, mapPopup } from "./page2";
// Portal (navigation/workflow) - NOT part of SelectorMap
export { portal } from "./portal";

/**
 * Type-safe selectors matching FormData structure.
 *
 * TypeScript will error if:
 * - Any FormData field is missing a selector
 * - Any selector key doesn't match FormData structure
 * - Any selector has wrong nested structure
 */
export const selectors: SelectorMap = {
  // Page 1: Applicant Information
  permitContact,
  violation,
  applicant,
  presidentOwner,
  subsidiary,
  propertyOwner,

  // Page 3: Project Details
  primaryContact,
  project,
  site,

  // Category A: Wind-Blown Dust
  categoryA,

  // Category B: Unpaved Roads/Staging
  categoryB1,
  categoryB2,

  // Category C: Disturbed Surfaces
  categoryC1,
  categoryC2,
  categoryC3,
  categoryC4,

  // Category D: Bulk Material Handling
  categoryD1,
  categoryD2,
  categoryD3,
  categoryD4,
  categoryD5,

  // Category E: Trackout Control
  categoryE1,
  categoryE2,

  // Category F: Grading
  categoryF1,
  categoryF2,

  // Category G: Construction
  categoryG1,
  categoryG2,

  // Category H: Demolition
  categoryH,

  // Category I: Weed Abatement
  categoryI1,
  categoryI2,

  // Category J: Blasting
  categoryJ,

  // Category K: Water Supply
  categoryK,

  // Post-K: Water Tier Requirements
  postK,

  // Page 5: Submit
  page5,

  // Metadata - not form fields, just tracking data
  _meta: {
    companyInDatabase: { yes: "", no: "" },
    skipApplicantSection: { yes: "", no: "" },
    noiPermitId: "",
    ltfNumber: "",
    extractionSource: {
      "noi+plan": "",
      "noi-only": "",
      manual: "",
      test: "",
    },
  },
};

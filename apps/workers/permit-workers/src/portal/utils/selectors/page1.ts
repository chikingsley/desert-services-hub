/**
 * Page 1 Selectors - Applicant Information
 *
 * siTable:1 - Contact info (email where permit is sent)
 * siTable:2 - Violation history
 * siTable:4 - Applicant's relationship + company info
 * siTable:5 - Applicant President/Owner
 * siTable:6 - Subsidiary information
 * siTable:7 - Property Owner information
 */

/** siTable:1 - Permit contact info */
export const permitContact = {
  email: '[id="ThePage:siTable:1:sioTable:0:siForm:text"]',
  name: '[id="ThePage:siTable:1:sioTable:1:siForm:text"]',
  phone: '[id="ThePage:siTable:1:sioTable:2:siForm:text"]',
} as const;

/** siTable:2 - "Have you been cited for a violation?" */
export const violation = {
  hasViolation: {
    yes: '[id="ThePage:siTable:2:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:2:sioTable:1:siForm:radio"]',
  },
  permitNumber: '[id="ThePage:siTable:2:sioTable:2:siForm:text"]',
} as const;

/** siTable:4 - Applicant's relationship to property + company info */
export const applicant = {
  /** Relationship checkboxes - FormData uses individual boolean fields */
  isPropertyOwner: {
    yes: '[id="ThePage:siTable:4:sioTable:0:siForm:checkboxTable:0:checkbox"]',
    no: "",
  },
  isGeneralContractor: {
    yes: '[id="ThePage:siTable:4:sioTable:0:siForm:checkboxTable:1:checkbox"]',
    no: "",
  },
  isDeveloper: {
    yes: '[id="ThePage:siTable:4:sioTable:0:siForm:checkboxTable:2:checkbox"]',
    no: "",
  },
  isLessee: {
    yes: '[id="ThePage:siTable:4:sioTable:0:siForm:checkboxTable:3:checkbox"]',
    no: "",
  },
  /** Company details */
  entityType: {
    Association:
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
    "Business Trust":
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
    Corporation:
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
    "General Partnership":
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
    "Government Entity":
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
    Individual:
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
    "Limited Liability Company":
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
    "Limited Partnership":
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
    "Sole Proprietor":
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
  },
  companyName: '[id="ThePage:siTable:4:sioTable:2:siForm:text"]',
  address1: '[id="ThePage:siTable:4:sioTable:3:siForm:text"]',
  address2: '[id="ThePage:siTable:4:sioTable:4:siForm:text"]',
  city: '[id="ThePage:siTable:4:sioTable:5:siForm:text"]',
  state: '[id="ThePage:siTable:4:sioTable:6:siForm:stateDef"]',
  zip: '[id="ThePage:siTable:4:sioTable:7:siForm:text"]',
  phone: '[id="ThePage:siTable:4:sioTable:8:siForm:text"]',
  email: '[id="ThePage:siTable:4:sioTable:9:siForm:text"]',
} as const;

/** siTable:5 - Applicant President/Owner */
export const presidentOwner = {
  firstName: '[id="ThePage:siTable:5:sioTable:0:siForm:text"]',
  lastName: '[id="ThePage:siTable:5:sioTable:1:siForm:text"]',
  address1: '[id="ThePage:siTable:5:sioTable:2:siForm:text"]',
  address2: '[id="ThePage:siTable:5:sioTable:3:siForm:text"]',
  city: '[id="ThePage:siTable:5:sioTable:4:siForm:text"]',
  state: '[id="ThePage:siTable:5:sioTable:5:siForm:stateDef"]',
  zip: '[id="ThePage:siTable:5:sioTable:6:siForm:text"]',
  phone: '[id="ThePage:siTable:5:sioTable:7:siForm:text"]',
  email: '[id="ThePage:siTable:5:sioTable:8:siForm:text"]',
} as const;

/** siTable:6 - "Is Applicant Wholly Owned Subsidiary?" */
export const subsidiary = {
  isSubsidiary: {
    yes: '[id="ThePage:siTable:6:sioTable:0:siForm:radio"]',
    no: '[id="ThePage:siTable:6:sioTable:1:siForm:radio"]',
  },
  /** Parent company fields (only visible when Yes) */
  parentEntityType: {
    Association:
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Business Trust":
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    Corporation:
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "General Partnership":
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Government Entity":
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    Individual:
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Limited Liability Company":
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Limited Partnership":
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Sole Proprietor":
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
  },
  parentName: '[id="ThePage:siTable:6:sioTable:3:siForm:text"]',
  parentAddress1: '[id="ThePage:siTable:6:sioTable:4:siForm:text"]',
  parentAddress2: '[id="ThePage:siTable:6:sioTable:5:siForm:text"]',
  parentCity: '[id="ThePage:siTable:6:sioTable:6:siForm:text"]',
  parentState: '[id="ThePage:siTable:6:sioTable:7:siForm:stateDef"]',
  parentZip: '[id="ThePage:siTable:6:sioTable:8:siForm:text"]',
  parentPhone: '[id="ThePage:siTable:6:sioTable:9:siForm:text"]',
  parentEmail: '[id="ThePage:siTable:6:sioTable:10:siForm:text"]',
  parentStateOfIncorporation:
    '[id="ThePage:siTable:6:sioTable:11:siForm:stateDef"]',
} as const;

/** siTable:7 - "Is Applicant the Property Owner/Developer?" */
export const propertyOwner = {
  isDifferent: {
    yes: '[id="ThePage:siTable:7:sioTable:1:siForm:radio"]',
    no: '[id="ThePage:siTable:7:sioTable:0:siForm:radio"]',
  },
  /** Property owner fields (only visible when isDifferent is Yes) */
  entityType: {
    Association:
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Business Trust":
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    Corporation:
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "General Partnership":
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Government Entity":
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    Individual:
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Limited Liability Company":
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Limited Partnership":
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    "Sole Proprietor":
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
  },
  name: '[id="ThePage:siTable:7:sioTable:3:siForm:text"]',
  address1: '[id="ThePage:siTable:7:sioTable:4:siForm:text"]',
  address2: '[id="ThePage:siTable:7:sioTable:5:siForm:text"]',
  city: '[id="ThePage:siTable:7:sioTable:6:siForm:text"]',
  state: '[id="ThePage:siTable:7:sioTable:7:siForm:stateDef"]',
  zip: '[id="ThePage:siTable:7:sioTable:8:siForm:text"]',
  phone: '[id="ThePage:siTable:7:sioTable:9:siForm:text"]',
  fax: '[id="ThePage:siTable:7:sioTable:10:siForm:text"]',
  contactFirstName: '[id="ThePage:siTable:7:sioTable:11:siForm:text"]',
  contactLastName: '[id="ThePage:siTable:7:sioTable:12:siForm:text"]',
  contactPhone: '[id="ThePage:siTable:7:sioTable:13:siForm:text"]',
  contactEmail: '[id="ThePage:siTable:7:sioTable:14:siForm:text"]',
} as const;

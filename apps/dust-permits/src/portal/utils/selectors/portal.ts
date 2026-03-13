/**
 * Portal Selectors - Navigation and Workflow
 *
 * These are NOT part of the FormData type-safe selectors.
 * They are used for navigation, workflow, and scraping.
 */

/** Disclaimer page (first thing you see) */
export const disclaimer = {
  agreeButton: '[onclick*="agree"]',
} as const;

/** Login page */
export const login = {
  emailInput: 'input[id*="userName"], input[type="text"]',
  loginBtn: 'a[id*="loginBtn"]',
  passwordInput: 'input[id*="password"], input[type="password"]',
} as const;

/** Post-login indicators (how we know login succeeded) */
export const loggedIn = {
  logoutLink: 'a:has-text("Logout")',
  myDustApps: "text=My Dust Control Applications",
  welcomeTextAlt: "text=Welcome,",
} as const;

/** Navigation (sidebar/header links) */
export const nav = {
  myDustControlApps: "text=My Dust Control Applications",
  navDustSearch: "text=Dust Application Search",
} as const;

/** Invoice pages */
export const invoice = {
  detail: {
    downloadPrintButton: '[id="invoiceDetail:DownloadPrintButton"]',
  },
  search: {
    invoiceNumberLabel: 'label:has-text("Invoice Number")',
    submitButton: 'a[id*="invoiceSearchBtn"]',
    firstResultDetailLink: 'a[href*="invoiceDetail.jsf"]',
  },
} as const;

/** My Dust Applications page (landing page after login) */
export const dustApps = {
  draftSection: "text=Draft Dust Applications",
  draftTable: "div[id*='draftDustAppTable']",
  draftTableLinks: "div[id*='draftDustAppTable'] a",
  exportToExcelBtn:
    'div[id*="submittedDustAppTable"] img[alt="Export to excel"]',
  newApplicationBtn: 'img[alt="New Application"]',
} as const;

/** Search page */
export const dustSearch = {
  cityInput: '[id="_idJsp6:projectCity"]',
  companyAutocomplete: ".ui-autocomplete",
  companyAutocompleteItems: ".ui-autocomplete .ui-menu-item",
  companyInput: '[id="_idJsp6:companyName"]',
  exportToExcelBtn: 'div[id*="dcpSearchTable"] img[alt="Export to excel"]',
  permitNumberInput: '[id="_idJsp6:dcpNumber"]',
  projectAddressInput: '[id="_idJsp6:projectAddress"]',
  projectNameInput: '[id="_idJsp6:projectName"]',
  resultsTable: "div[id*='dcpSearchTable']",
  statusDropdown: 'select[id*="dcpStateCds"]',
  submitBtn: 'a[id*="dustAppSearch_SubmitBtn"] img',
  submitLink: 'a[id*="SubmitBtn"]',
} as const;

/** New application popup (multi-step wizard) */
export const newAppPopup = {
  continueBtn: 'img[alt="Continue"]',
  reapplicationCheckbox: '[id="newDustApplcation:copyApplication"]',
  copyFromAppDropdown: '[id="newDustApplcation:_idJsp24"]',
  showAllCompaniesDropdown:
    '[id="newDustApplcation:assoicatedCompanies-nb__xc_c"]',
  companyRadioButtons: 'input[name="RadioButtons"]',
  newCompanyCheckbox: '[id="newDustApplcation:newCompany"]',
  createBtn: 'img[alt="Create"]',
  createAnchor: '[id="newDustApplcation:createNewApplication"]',
  // Revision flow
  revisionCheckbox: '[id="newDustApplcation:revision"]',
  revisionAppDropdown: '[id="newDustApplcation:_idJsp19"]',
  revisionPurposeTextarea: '[id="newDustApplcation:_idJsp21"]',
} as const;

/** Application detail header (shown on all pages) */
export const applicationDetail = {
  closePermitBtn: 'img[alt="Close Permit"], img[title="Close Permit"]',
  deleteBtn: 'img[alt="Delete Application"]',
  detailForm: "form#dustApplicationDetail",
  detailFormAlt: "[id*='dustApplicationDetail']",
} as const;

/** Delete popup */
export const deletePopup = {
  cancelBtn: 'img[alt="Cancel"]',
  confirmDeleteBtn: 'img[alt="Delete"]',
} as const;

/** Header fields shown at top of application */
export const header = {
  applicationId: '[id="ThePage:applicationId"]',
  companyName: '[id="ThePage:companyName"]',
  createdDate: '[id="ThePage:createdDate"]',
  expirationDate: '[id="ThePage:_idJsp30"]',
  issueDate: '[id="ThePage:_idJsp29"]',
  projectName: '[id="ThePage:projectName"]',
  status: '[id="ThePage:dcpStateCd"]',
} as const;

/** Step navigation (top tabs) */
export const stepNav = {
  page1: '#ThePage\\:_idJsp19 a:has-text("1. Applicant")',
  page2: '#ThePage\\:_idJsp19 a:has-text("2. Project Location")',
  page3: '#ThePage\\:_idJsp19 a:has-text("3. Project Details")',
  page4: '#ThePage\\:_idJsp19 a:has-text("4. Dust Control")',
  page5: '#ThePage\\:_idJsp19 a:has-text("5. Submit")',
  table: "#ThePage\\:_idJsp19",
} as const;

/** Page navigation */
export const pageNav = {
  nextButton: 'a[onclick*="ThePage:_idJsp330"]',
} as const;

/** Markers to detect which page we're currently on */
export const pageMarkers = {
  page1ApplicantInfo: 'text="Applicant Information"',
  page1Email: 'text="Provide an email address where we can send the permit"',
  page5Submit: 'text="Submit Application"',
} as const;

/** Page 5 submit actions */
export const submit = {
  submitApplicationBtn: 'img[alt="Submit Application"]',
  submitApplicationLink: 'a:has(img[alt="Submit Application"])',
  /** Fallback: the text link itself */
  submitApplicationText: 'a:has-text("Submit Application")',
} as const;

/** Page 2 - Project Location */
export const page2 = {
  accessPointsTable: '[id="ThePage:siTable:12:accessPoints"]',
  addSiteDrawingBtn:
    'img[alt="Add Site Drawing"], img[title="Add Site Drawing"]',
  deleteSiteDrawingBtn: 'img[alt="Delete Site Drawing"]',
  editSiteDrawingBtn:
    'img[alt="Edit Site Drawing"], img[title="Edit Site Drawing"]',
  locationsTable: '[id="ThePage:siTable:12:locations"]',
  selectFirstLocation: '[id="ThePage:siTable:12:locations:0:selectRadio"]',
} as const;

/** Site Drawing Confirmation Popup (appears for revisions when clicking Add Site Drawing) */
export const siteDrawingPopup = {
  cancelBtn: '[id="newRevisionSiteDrawing:cancelNewRevisionSiteDrawing"]',
  copyCheckbox: '[id="newRevisionSiteDrawing:_idJsp12"]',
  createBtn: '[id="newRevisionSiteDrawing:createNewRevisionSiteDrawing"]',
} as const;

/** Close permit popup */
export const closePermit = {
  buildingsCheckbox: '[id="_idJsp4:closePermitSoilMethod:_1"]',
  cancelBtn: 'img[title="Cancel"]',
  closePermitBtn: 'img[title="Close Permit"]',
  gravelCheckbox: '[id="_idJsp4:closePermitSoilMethod:_0"]',
  lessThanPointOneAcreCheckbox: '[id="_idJsp4:closePermitSoilMethod:_2"]',
  otherCheckbox: '[id="_idJsp4:closePermitSoilMethod:_3"]',
  reasonTextarea: '[id="_idJsp4:_idJsp7"]',
} as const;

/** Detail extraction selectors (for scraping) */
export const detailExtract = {
  applicantCompany: {
    relationshipCheckboxes:
      '[id^="ThePage:siTable:4:sioTable:0:siForm:checkboxTable"]',
    entityType:
      '[id="ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef"]',
    companyName: '[id="ThePage:siTable:4:sioTable:2:siForm:text"]',
    address1: '[id="ThePage:siTable:4:sioTable:3:siForm:text"]',
    address2: '[id="ThePage:siTable:4:sioTable:4:siForm:text"]',
    city: '[id="ThePage:siTable:4:sioTable:5:siForm:text"]',
    state: '[id="ThePage:siTable:4:sioTable:6:siForm:stateDef"]',
    zip: '[id="ThePage:siTable:4:sioTable:7:siForm:text"]',
    phone: '[id="ThePage:siTable:4:sioTable:8:siForm:text"]',
    email: '[id="ThePage:siTable:4:sioTable:9:siForm:text"]',
  },
  applicantOwner: {
    firstName: '[id="ThePage:siTable:5:sioTable:0:siForm:text"]',
    lastName: '[id="ThePage:siTable:5:sioTable:1:siForm:text"]',
    address1: '[id="ThePage:siTable:5:sioTable:2:siForm:text"]',
    address2: '[id="ThePage:siTable:5:sioTable:3:siForm:text"]',
    city: '[id="ThePage:siTable:5:sioTable:4:siForm:text"]',
    state: '[id="ThePage:siTable:5:sioTable:5:siForm:stateDef"]',
    zip: '[id="ThePage:siTable:5:sioTable:6:siForm:text"]',
    phone: '[id="ThePage:siTable:5:sioTable:7:siForm:text"]',
    email: '[id="ThePage:siTable:5:sioTable:8:siForm:text"]',
  },
  contact: {
    email: '[id="ThePage:siTable:1:sioTable:0:siForm:text"]',
    name: '[id="ThePage:siTable:1:sioTable:1:siForm:text"]',
    phone: '[id="ThePage:siTable:1:sioTable:2:siForm:text"]',
  },
  header: {
    applicationId: '[id="ThePage:applicationId"]',
    projectName: '[id="ThePage:projectName"]',
    companyName: '[id="ThePage:companyName"]',
    status: '[id="ThePage:dcpStateCd"]',
    createdDate: '[id="ThePage:createdDate"]',
    issueDate: '[id="ThePage:_idJsp29"]',
    expirationDate: '[id="ThePage:_idJsp30"]',
  },
  isOwnerDeveloper: {
    yesRadio: '[id="ThePage:siTable:7:sioTable:0:siForm:radio__xc_r"]',
    noRadio: '[id="ThePage:siTable:7:sioTable:1:siForm:radio__xc_r"]',
  },
  isOwnerDeveloperAlt: {
    yesRadio: '[id="ThePage:siTable:6:sioTable:0:siForm:radio__xc_r"]',
    noRadio: '[id="ThePage:siTable:6:sioTable:1:siForm:radio__xc_r"]',
  },
  parentCompany: {
    entityType:
      '[id="ThePage:siTable:6:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
    name: '[id="ThePage:siTable:6:sioTable:3:siForm:text"]',
    address1: '[id="ThePage:siTable:6:sioTable:4:siForm:text"]',
    address2: '[id="ThePage:siTable:6:sioTable:5:siForm:text"]',
    city: '[id="ThePage:siTable:6:sioTable:6:siForm:text"]',
    state: '[id="ThePage:siTable:6:sioTable:7:siForm:stateDef"]',
    zip: '[id="ThePage:siTable:6:sioTable:8:siForm:text"]',
    phone: '[id="ThePage:siTable:6:sioTable:9:siForm:text"]',
    email: '[id="ThePage:siTable:6:sioTable:10:siForm:text"]',
    stateOfIncorporation:
      '[id="ThePage:siTable:6:sioTable:11:siForm:stateDef"]',
  },
  primaryContact: {
    firstName: '[id="ThePage:siTable:8:sioTable:1:siForm:text"]',
    lastName: '[id="ThePage:siTable:8:sioTable:2:siForm:text"]',
    title: '[id="ThePage:siTable:8:sioTable:3:siForm:text"]',
    email: '[id="ThePage:siTable:8:sioTable:4:siForm:text"]',
    companyName: '[id="ThePage:siTable:8:sioTable:5:siForm:text"]',
    onSitePhone: '[id="ThePage:siTable:8:sioTable:6:siForm:text"]',
    mobile: '[id="ThePage:siTable:8:sioTable:7:siForm:text"]',
    fax: '[id="ThePage:siTable:8:sioTable:8:siForm:text"]',
  },
  project: {
    name: '[id="ThePage:siTable:11:sioTable:0:siForm:text"]',
    description: '[id="ThePage:siTable:11:sioTable:1:siForm:textarea"]',
    startDate: '[id="ThePage:siTable:11:sioTable:2:siForm:date"]',
    endDate: '[id="ThePage:siTable:11:sioTable:3:siForm:date"]',
  },
  propertyOwnerDeveloper: {
    entityType:
      '[id="ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef"]',
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
  },
  siteLocation: {
    disturbedArea: '[id="ThePage:siTable:12:_idJsp173"]',
    locationsTable: '[id="ThePage:siTable:12:locations"]',
    locationRow: {
      address: '[id="ThePage:siTable:12:locations:{N}:_idJsp192"]',
      city: '[id="ThePage:siTable:12:locations:{N}:_idJsp194"]',
      county: '[id="ThePage:siTable:12:locations:{N}:_idJsp196"]',
      state: '[id="ThePage:siTable:12:locations:{N}:_idJsp198"]',
      zip: '[id="ThePage:siTable:12:locations:{N}:_idJsp200"]',
      parcel: '[id="ThePage:siTable:12:locations:{N}:_idJsp202"]',
      latitude: '[id="ThePage:siTable:12:locations:{N}:_idJsp204"]',
      longitude: '[id="ThePage:siTable:12:locations:{N}:_idJsp206"]',
      selectRadio: '[id="ThePage:siTable:12:locations:{N}:selectRadio__xc_r"]',
    },
    accessPointsTable: '[id="ThePage:siTable:12:accessPoints"]',
    accessPointRow: {
      latitude: '[id="ThePage:siTable:12:accessPoints:{N}:_idJsp227"]',
      longitude: '[id="ThePage:siTable:12:accessPoints:{N}:_idJsp229"]',
    },
  },
  trackoutDevices: {
    gravelPad:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:0:checkbox__xc_c"]',
    grizzlyRumbleGrate:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:1:checkbox__xc_c"]',
    wheelWash:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:2:checkbox__xc_c"]',
    pavedArea:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:3:checkbox__xc_c"]',
    other:
      '[id="ThePage:siTable:35:sioTable:2:siForm:checkboxTable:4:checkbox__xc_c"]',
  },
  trackoutE1: {
    yesRadio: '[id="ThePage:siTable:35:sioTable:0:siForm:radio__xc_r"]',
    noRadio: '[id="ThePage:siTable:35:sioTable:1:siForm:radio__xc_r"]',
  },
  waterMethods: {
    hose: '[id="ThePage:siTable:53:sioTable:0:siForm:checkbox__xc_c"]',
    waterTruck: '[id="ThePage:siTable:53:sioTable:1:siForm:checkbox__xc_c"]',
    waterPull: '[id="ThePage:siTable:53:sioTable:2:siForm:checkbox__xc_c"]',
    waterBuffalo: '[id="ThePage:siTable:53:sioTable:3:siForm:checkbox__xc_c"]',
    other: '[id="ThePage:siTable:53:sioTable:4:siForm:checkbox__xc_c"]',
  },
} as const;

/** Scraper selectors */
export const scraper = {
  applicantInfo: '[id*="applicantInfo"]',
} as const;

/** Combined portal selectors */
export const portal = {
  applicationDetail,
  closePermit,
  deletePopup,
  detailExtract,
  disclaimer,
  dustApps,
  dustSearch,
  header,
  invoice,
  loggedIn,
  login,
  nav,
  newAppPopup,
  page2,
  pageMarkers,
  pageNav,
  scraper,
  siteDrawingPopup,
  stepNav,
  submit,
} as const;

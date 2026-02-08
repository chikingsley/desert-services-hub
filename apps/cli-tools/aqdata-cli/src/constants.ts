export const BASE_URL = "https://aqdata.maricopa.gov";

export const PAGES = {
  disclaimer: "/disclaimer.jsf",
  home: "/home/about.jsf",
  dustApplicationSearch: "/applications/dustApplicationSearch.jsf",
  applicationSearch: "/applications/applicationSearch.jsf",
  inspectionSearch: "/ceta/fceSearch.jsf",
  complianceReportSearch: "/compliance/compReportSearch.jsf",
  enforcementSearch: "/ceta/enforcementSearch.jsf",
  settlementSearch: "/ceta/settlementSearch.jsf",
  siteVisitSearch: "/ceta/siteVisitSearch.jsf",
} as const;

// Tab source IDs change depending on which page you're currently on.
// Pattern: {prefix}:{tabIndex}:{suffix}
export const TAB_SOURCES = {
  home: { prefix: "_idJsp4", suffix: "_idJsp12" },
  applications: { prefix: "_idJsp7", suffix: "_idJsp14" },
  compliance: { prefix: "_idJsp6", suffix: "_idJsp13" },
} as const;

// Main tab indices (N in prefix:N:suffix)
export const TAB_INDEX: Record<string, number> = {
  home: 0,
  facilities: 1,
  companies: 2,
  complaints: 3,
  correspondence: 4,
  applications: 5,
  compliance: 6,
  permits: 7,
  emissions: 8,
  invoices: 9,
  reports: 10,
  monitors: 11,
};

// Disclaimer form
export const DISCLAIMER = {
  formName: "_idJsp0",
  agreeBtn: "_idJsp1:agreeBtn",
  stateTokenField: "oracle.adf.faces.STATE_TOKEN",
  formField: "oracle.adf.faces.FORM",
} as const;

// Home page form
export const HOME = {
  formName: "_idJsp3",
} as const;

// Per-page form identifiers (discovered via site exploration)
export const FORMS = {
  dustApplications: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    statusField: "_idJsp6:dcpStateCds",
    submitBtn: "_idJsp6:dustAppSearch_SubmitBtn",
    resetBtn: "_idJsp6:dustAppSearch_ResetBtn",
    resultsTable: "_idJsp6:dcpSearchTable",
    exportBtn: "_idJsp6:dcpSearchTable:_idJsp72",
    fields: {
      applicationId: "_idJsp6:dcpNumber",
      facilityId: "_idJsp6:facilityId",
      facilityName: "_idJsp6:facilityName",
      projectName: "_idJsp6:projectName",
      companyName: "_idJsp6:cmpName",
      companyNameHidden: "_idJsp6:cmpName-hidden",
      address: "_idJsp6:_idJsp25",
      city: "_idJsp6:_idJsp26",
      parcel: "_idJsp6:_idJsp27",
      blockPermit: "_idJsp6:blockPermit",
      acceleratedProcessing: "_idJsp6:acceleratedProcessing",
      dateField: "_idJsp6:dateField",
      dateFrom: "_idJsp6:From",
      dateTo: "_idJsp6:To",
      balance: "_idJsp6:_idJsp29",
    },
  },
  inspections: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    submitBtn: "_idJsp6:inspectionSearch_SubmitBtn",
    resetBtn: "_idJsp6:inspectionSearch_ResetBtn",
    resultsTable: "_idJsp6:fceTable",
    exportBtn: "_idJsp6:fceTable:_idJsp94",
    fields: {
      facilityId: "_idJsp6:inspectionSearch_FacilityID",
      facilityName: "_idJsp6:inspectionSearch_FacilityName",
      facilityClass: "_idJsp6:inspectionSearch_FacilityClass",
      facilityType: "_idJsp6:inspectionSearch_FacilityType",
      inspectionId: "_idJsp6:inspectionSearch_InspectionID",
      companyName: "_idJsp6:cmpName",
      companyNameHidden: "_idJsp6:cmpName-hidden",
      dateFrom: "_idJsp6:beginInspectionCompletedDt",
      dateTo: "_idJsp6:endInspectionCompletedDt",
    },
  },
  complianceReports: {
    formName: "_idJsp4",
    prefix: "_idJsp7",
    submitBtn: "_idJsp7:compReportSearch_SubmitBtn",
    resetBtn: "_idJsp7:compReportSearch_ResetBtn",
    exportBtn: "", // discover during spike
    fields: {
      facilityId: "_idJsp7:compReportSearch_FacilityID",
      facilityName: "_idJsp7:compReportSearch_FacilityName",
      reportId: "_idJsp7:compReportSearch_ReportID",
      companyName: "_idJsp7:cmpName",
    },
  },
  enforcementActions: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    submitBtn: "_idJsp6:eaSearch_SubmitBtn",
    resetBtn: "_idJsp6:eaSearch_ResetBtn",
    exportBtn: "", // discover during spike
    fields: {
      facilityId: "_idJsp6:eaSearch_FacilityID",
      facilityName: "_idJsp6:eaSearch_FacilityName",
      actionId: "_idJsp6:eaSearch_EnforcementActionID",
      companyName: "_idJsp6:cmpName",
    },
  },
  settlements: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    submitBtn: "_idJsp6:saSearch_SubmitBtn",
    resetBtn: "_idJsp6:saSearch_ResetBtn",
    exportBtn: "", // discover during spike
    fields: {
      settlementId: "_idJsp6:saSearch_SettlementID",
      companyName: "_idJsp6:cmpName",
      enforcementActionId: "_idJsp6:saSearch_enfID",
    },
  },
  siteVisits: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    submitBtn: "_idJsp6:siteVisitSearchBtn",
    resetBtn: "_idJsp6:_idJsp43",
    exportBtn: "", // discover during spike
    fields: {
      facilityId: "_idJsp6:_idJsp21",
      facilityName: "_idJsp6:_idJsp22",
      facilityClass: "_idJsp6:_idJsp23",
      visitType: "_idJsp6:visitTypeChoice",
      companyName: "_idJsp6:cmpName",
      dateFrom: "_idJsp6:visitAfterDate",
      dateTo: "_idJsp6:visitBeforeDate",
    },
  },
} as const;

// Compliance sub-tab source IDs (when on compliance pages)
export const COMPLIANCE_SUBTABS = {
  inspectionSearch: "_idJsp6:12:_idJsp13",
  complianceReportSearch: "_idJsp6:14:_idJsp13",
  enforcementSearch: "_idJsp6:16:_idJsp13",
  settlementSearch: "_idJsp6:18:_idJsp13",
  siteVisitSearch: "_idJsp6:20:_idJsp13",
} as const;

// Applications sub-tab source IDs (when on applications pages)
export const APPLICATIONS_SUBTABS = {
  applicationSearch: "_idJsp7:12:_idJsp14",
  dustApplicationSearch: "_idJsp7:16:_idJsp14",
} as const;

// Dust application status multi-select values
export const DUST_APP_STATUS_VALUES: Record<string, string> = {
  Active: "0",
  Closed: "1",
  Rejected: "2",
  Submitted: "3",
  Superseded: "4",
};

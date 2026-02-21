export const BASE_URL = "https://aqdata.maricopa.gov";

export const PAGES = {
  applicationSearch: "/applications/applicationSearch.jsf",
  asbestosNotificationSearch: "/applications/asbestosNotificationSearch.jsf",
  complaintSearch: "/complaints/complaintSearch.jsf",
  complianceReportSearch: "/compliance/compReportSearch.jsf",
  disclaimer: "/disclaimer.jsf",
  dustApplicationSearch: "/applications/dustApplicationSearch.jsf",
  enforcementSearch: "/ceta/enforcementSearch.jsf",
  home: "/home/about.jsf",
  inspectionSearch: "/ceta/fceSearch.jsf",
  invoiceSearch: "/inv/invSearch.jsf",
  settlementSearch: "/ceta/settlementSearch.jsf",
  siteVisitSearch: "/ceta/siteVisitSearch.jsf",
} as const;

// Tab source IDs change depending on which page you're currently on.
// Pattern: {prefix}:{tabIndex}:{suffix}
export const TAB_SOURCES = {
  applications: { prefix: "_idJsp7", suffix: "_idJsp14" },
  compliance: { prefix: "_idJsp6", suffix: "_idJsp13" },
  home: { prefix: "_idJsp4", suffix: "_idJsp12" },
} as const;

// Main tab indices (N in prefix:N:suffix)
export const TAB_INDEX: Record<string, number> = {
  applications: 5,
  companies: 2,
  complaints: 3,
  compliance: 6,
  correspondence: 4,
  emissions: 8,
  facilities: 1,
  home: 0,
  invoices: 9,
  monitors: 11,
  permits: 7,
  reports: 10,
};

// Disclaimer form
export const DISCLAIMER = {
  agreeBtn: "_idJsp1:agreeBtn",
  formField: "oracle.adf.faces.FORM",
  formName: "_idJsp0",
  stateTokenField: "oracle.adf.faces.STATE_TOKEN",
} as const;

// Home page form
export const HOME = {
  formName: "_idJsp3",
} as const;

// Per-page form identifiers (discovered via site exploration)
export const FORMS = {
  asbestosNotifications: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    submitBtn: "_idJsp6:asbestosNotificationSearch_SubmitBtn",
    resultsTable: "_idJsp6:asbestosNotificationsTbl",
    exportBtn: "_idJsp6:asbestosNotificationsTbl:_idJsp69",
    fields: {
      notificationNumber: "_idJsp6:asbtNumber",
      status: "_idJsp6:asbtStatusCds",
      companyName: "_idJsp6:cmpName",
      facilityId: "_idJsp6:facilityId",
      facilityName: "_idJsp6:facilityName",
      dateField: "_idJsp6:dateField",
      dateFrom: "_idJsp6:From",
      dateTo: "_idJsp6:To",
      asbestosZone: "_idJsp6:_idJsp25",
      county: "_idJsp6:_idJsp27",
      ranking: "_idJsp6:ranking",
    },
  },
  complaints: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    submitBtn: "_idJsp6:complaintSearchSubmitBtn",
    resetBtn: "_idJsp6:resetComplaintSearch",
    resultsTable: "_idJsp6:_idJsp43",
    exportBtn: "_idJsp6:_idJsp43:_idJsp75",
    fields: {},
  },
  complianceReports: {
    formName: "_idJsp4",
    prefix: "_idJsp7",
    submitBtn: "_idJsp7:compReportSearch_SubmitBtn",
    resetBtn: "_idJsp7:compReportSearch_ResetBtn",
    resultsTable: "_idJsp7:complianceReportsTable",
    exportBtn: "_idJsp7:complianceReportsTable:_idJsp124",
    fields: {
      facilityId: "_idJsp7:compReportSearch_FacilityID",
      facilityName: "_idJsp7:compReportSearch_FacilityName",
      reportId: "_idJsp7:compReportSearch_ReportID",
      companyName: "_idJsp7:cmpName",
    },
  },
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
  enforcementActions: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    submitBtn: "_idJsp6:eaSearch_SubmitBtn",
    resetBtn: "_idJsp6:eaSearch_ResetBtn",
    resultsTable: "_idJsp6:_idJsp33",
    exportBtn: "_idJsp6:_idJsp33:_idJsp86",
    fields: {
      facilityId: "_idJsp6:eaSearch_FacilityID",
      facilityName: "_idJsp6:eaSearch_FacilityName",
      actionId: "_idJsp6:eaSearch_EnforcementActionID",
      companyName: "_idJsp6:cmpName",
    },
  },
  invoices: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    submitBtn: "_idJsp6:invoiceSearchBtn",
    resetBtn: "_idJsp6:_idJsp46",
    resultsTable: "_idJsp6:_idJsp51",
    exportBtn: "_idJsp6:_idJsp51:_idJsp104",
    fields: {},
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
  settlements: {
    formName: "_idJsp5",
    prefix: "_idJsp6",
    submitBtn: "_idJsp6:saSearch_SubmitBtn",
    resetBtn: "_idJsp6:saSearch_ResetBtn",
    resultsTable: "_idJsp6:_idJsp29",
    exportBtn: "_idJsp6:_idJsp29:_idJsp45",
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
    resultsTable: "_idJsp6:_idJsp48",
    exportBtn: "_idJsp6:_idJsp48:_idJsp80",
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
  complianceReportSearch: "_idJsp6:14:_idJsp13",
  enforcementSearch: "_idJsp6:16:_idJsp13",
  inspectionSearch: "_idJsp6:12:_idJsp13",
  settlementSearch: "_idJsp6:18:_idJsp13",
  siteVisitSearch: "_idJsp6:20:_idJsp13",
} as const;

// Applications sub-tab source IDs (when on applications pages)
export const APPLICATIONS_SUBTABS = {
  applicationSearch: "_idJsp7:12:_idJsp14",
  asbestosNotificationSearch: "_idJsp7:14:_idJsp14",
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

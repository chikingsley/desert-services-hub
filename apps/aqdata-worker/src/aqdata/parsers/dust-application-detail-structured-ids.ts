export const DETAIL_STRUCTURED_IDS = {
  applicantCompany: {
    address1: "ThePage:siTable:4:sioTable:3:siForm:text",
    address2: "ThePage:siTable:4:sioTable:4:siForm:text",
    city: "ThePage:siTable:4:sioTable:5:siForm:text",
    companyName: "ThePage:siTable:4:sioTable:2:siForm:text",
    email: "ThePage:siTable:4:sioTable:9:siForm:text",
    entityType:
      "ThePage:siTable:4:sioTable:1:siForm:companyLawfulPresenceTypeDef",
    phone: "ThePage:siTable:4:sioTable:8:siForm:text",
    state: "ThePage:siTable:4:sioTable:6:siForm:stateDef",
    zip: "ThePage:siTable:4:sioTable:7:siForm:text",
  },
  applicantOwner: {
    address1: "ThePage:siTable:5:sioTable:2:siForm:text",
    address2: "ThePage:siTable:5:sioTable:3:siForm:text",
    city: "ThePage:siTable:5:sioTable:4:siForm:text",
    email: "ThePage:siTable:5:sioTable:8:siForm:text",
    firstName: "ThePage:siTable:5:sioTable:0:siForm:text",
    lastName: "ThePage:siTable:5:sioTable:1:siForm:text",
    phone: "ThePage:siTable:5:sioTable:7:siForm:text",
    state: "ThePage:siTable:5:sioTable:5:siForm:stateDef",
    zip: "ThePage:siTable:5:sioTable:6:siForm:text",
  },
  contact: {
    email: "ThePage:siTable:1:sioTable:0:siForm:text",
    name: "ThePage:siTable:1:sioTable:1:siForm:text",
    phone: "ThePage:siTable:1:sioTable:2:siForm:text",
  },
  header: {
    applicationId: "ThePage:applicationId",
    companyName: "ThePage:companyName",
    createdDate: "ThePage:createdDate",
    expirationDate: "ThePage:_idJsp26",
    issueDate: "ThePage:_idJsp25",
    projectName: "ThePage:projectName",
    status: "ThePage:dcpStateCd",
  },
  isOwnerDeveloper: {
    noPrimary: "ThePage:siTable:7:sioTable:1:siForm:radio__xc_r",
    noSecondary: "ThePage:siTable:6:sioTable:1:siForm:radio__xc_r",
    yesPrimary: "ThePage:siTable:7:sioTable:0:siForm:radio__xc_r",
    yesSecondary: "ThePage:siTable:6:sioTable:0:siForm:radio__xc_r",
  },
  primaryContact: {
    companyName: "ThePage:siTable:8:sioTable:5:siForm:text",
    email: "ThePage:siTable:8:sioTable:4:siForm:text",
    fax: "ThePage:siTable:8:sioTable:8:siForm:text",
    firstName: "ThePage:siTable:8:sioTable:1:siForm:text",
    lastName: "ThePage:siTable:8:sioTable:2:siForm:text",
    mobile: "ThePage:siTable:8:sioTable:7:siForm:text",
    onSitePhone: "ThePage:siTable:8:sioTable:6:siForm:text",
    title: "ThePage:siTable:8:sioTable:3:siForm:text",
  },
  project: {
    description: "ThePage:siTable:11:sioTable:1:siForm:textarea",
    endDate: "ThePage:siTable:11:sioTable:3:siForm:date",
    name: "ThePage:siTable:11:sioTable:0:siForm:text",
    startDate: "ThePage:siTable:11:sioTable:2:siForm:date",
  },
  propertyOwnerDeveloper: {
    address1: "ThePage:siTable:7:sioTable:4:siForm:text",
    address2: "ThePage:siTable:7:sioTable:5:siForm:text",
    city: "ThePage:siTable:7:sioTable:6:siForm:text",
    contactEmail: "ThePage:siTable:7:sioTable:14:siForm:text",
    contactFirstName: "ThePage:siTable:7:sioTable:11:siForm:text",
    contactLastName: "ThePage:siTable:7:sioTable:12:siForm:text",
    contactPhone: "ThePage:siTable:7:sioTable:13:siForm:text",
    entityType:
      "ThePage:siTable:7:sioTable:2:siForm:companyLawfulPresenceTypeDef",
    fax: "ThePage:siTable:7:sioTable:10:siForm:text",
    name: "ThePage:siTable:7:sioTable:3:siForm:text",
    phone: "ThePage:siTable:7:sioTable:9:siForm:text",
    state: "ThePage:siTable:7:sioTable:7:siForm:stateDef",
    zip: "ThePage:siTable:7:sioTable:8:siForm:text",
  },
  siteLocation: {
    disturbedAreaFallback: "ThePage:siTable:12:_idJsp173",
  },
  trackoutDevices: {
    gravelPad:
      "ThePage:siTable:35:sioTable:2:siForm:checkboxTable:0:checkbox__xc_c",
    grizzlyRumbleGrate:
      "ThePage:siTable:35:sioTable:2:siForm:checkboxTable:1:checkbox__xc_c",
    other:
      "ThePage:siTable:35:sioTable:2:siForm:checkboxTable:4:checkbox__xc_c",
    pavedArea:
      "ThePage:siTable:35:sioTable:2:siForm:checkboxTable:3:checkbox__xc_c",
    wheelWash:
      "ThePage:siTable:35:sioTable:2:siForm:checkboxTable:2:checkbox__xc_c",
  },
  trackoutE1: {
    no: "ThePage:siTable:35:sioTable:1:siForm:radio__xc_r",
    yes: "ThePage:siTable:35:sioTable:0:siForm:radio__xc_r",
  },
  waterMethods: {
    hose: "ThePage:siTable:53:sioTable:0:siForm:checkbox__xc_c",
    other: "ThePage:siTable:53:sioTable:4:siForm:checkbox__xc_c",
    waterBuffalo: "ThePage:siTable:53:sioTable:3:siForm:checkbox__xc_c",
    waterPull: "ThePage:siTable:53:sioTable:2:siForm:checkbox__xc_c",
    waterTruck: "ThePage:siTable:53:sioTable:1:siForm:checkbox__xc_c",
  },
} as const;

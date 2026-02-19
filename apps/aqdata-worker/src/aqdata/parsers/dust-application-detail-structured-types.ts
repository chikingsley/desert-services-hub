export interface DustApplicationLocationRow {
  address: string;
  city: string;
  county: string;
  isSelected: boolean;
  latitude: string;
  longitude: string;
  parcel: string;
  state: string;
  zip: string;
}

export interface DustApplicationAccessPointRow {
  latitude: string;
  longitude: string;
}

export interface DustApplicationStructuredDetail {
  applicantCompany: {
    address1: string;
    address2: string;
    city: string;
    companyName: string;
    email: string;
    entityType: string;
    phone: string;
    state: string;
    zip: string;
  };
  applicantOwner: {
    address1: string;
    address2: string;
    city: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    state: string;
    zip: string;
  };
  contact: {
    email: string;
    name: string;
    phone: string;
  };
  header: {
    applicationId: string;
    companyName: string;
    createdDate: string;
    expirationDate: string;
    issueDate: string;
    projectName: string;
    status: string;
  };
  isOwnerDeveloper: boolean | null;
  primaryContact: {
    companyName: string;
    email: string;
    fax: string;
    firstName: string;
    lastName: string;
    mobile: string;
    onSitePhone: string;
    title: string;
  };
  project: {
    description: string;
    endDate: string;
    name: string;
    startDate: string;
  };
  propertyOwnerDeveloper: {
    address1: string;
    address2: string;
    city: string;
    contactEmail: string;
    contactFirstName: string;
    contactLastName: string;
    contactPhone: string;
    entityType: string;
    fax: string;
    name: string;
    phone: string;
    state: string;
    zip: string;
  } | null;
  siteLocation: {
    accessPoints: DustApplicationAccessPointRow[];
    disturbedArea: string;
    locations: DustApplicationLocationRow[];
  };
  trackoutDevices: {
    gravelPad: boolean;
    grizzlyRumbleGrate: boolean;
    other: boolean;
    pavedArea: boolean;
    wheelWash: boolean;
  };
  trackoutE1Answer: boolean | null;
  waterMethods: {
    hose: boolean;
    other: boolean;
    waterBuffalo: boolean;
    waterPull: boolean;
    waterTruck: boolean;
  };
}

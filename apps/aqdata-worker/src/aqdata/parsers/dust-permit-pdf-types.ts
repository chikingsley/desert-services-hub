export interface DustPermitPdfCoordinates {
  latitude: number;
  longitude: number;
}

export interface DustPermitPdfPrimaryContact {
  companyName: string;
  email: string;
  fax: string;
  firstName: string;
  lastName: string;
  mobile: string;
  onSitePhone: string;
  title: string;
}

export interface DustPermitPdfApplicant {
  address1: string;
  address2: string;
  city: string;
  companyName: string;
  email: string;
  entityType: string;
  phone: string;
  state: string;
  zip: string;
}

export interface DustPermitPdfProject {
  acreage: string;
  completionDate: string;
  description: string;
  name: string;
  startDate: string;
  type: string;
}

export interface DustPermitPdfFields {
  applicant: DustPermitPdfApplicant;
  applicationStatus: string;
  attention: string;
  blockPermit: string;
  coordinates: DustPermitPdfCoordinates | null;
  expirationDate: string;
  facilityId: string;
  issueDate: string;
  parcel: string;
  permitContactEmail: string;
  permitContactName: string;
  permitContactPhone: string;
  primaryContact: DustPermitPdfPrimaryContact;
  project: DustPermitPdfProject;
  siteAddress: string;
  submittedDate: string;
}

export interface DustPermitPdfExtraction {
  bytes: number;
  contentType: string | null;
  emails: string[];
  extractionMethod: "pdftotext" | "pdfjs";
  fields: DustPermitPdfFields;
  labelValues: Record<string, string>;
  pageCount: number | null;
  warnings: string[];
}

export interface DustPermitPdfTextExtractionResult {
  method: "pdftotext" | "pdfjs";
  pageCount: number | null;
  text: string;
}

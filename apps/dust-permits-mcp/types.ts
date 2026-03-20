/**
 * Permit Worker API Types
 *
 * Request/response types for the permit-worker HTTP API.
 * Independently defined — no imports from apps/dust-permits.
 */

// ============================================================================
// Core Data Types (mirrors portal types)
// ============================================================================

export interface PermitLocation {
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

export interface AccessPoint {
  latitude: string;
  longitude: string;
}

/** Complete scraped permit data from portal detail page. */
export interface PermitData {
  accessPoints: AccessPoint[];
  applicantCompany: {
    entityType: string;
    name: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email: string;
  };
  applicantOwner: {
    firstName: string;
    lastName: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email: string;
  };
  applicationId: string;
  companyName: string;
  contact: { email: string; name: string; phone: string };
  createdDate: string;
  disturbedArea: string;
  expirationDate: string;
  isOwnerDeveloper: boolean | null;
  issueDate: string;
  locations: PermitLocation[];
  primaryContact: {
    firstName: string;
    lastName: string;
    title: string;
    email: string;
    companyName: string;
    onSitePhone: string;
    mobile: string;
    fax: string;
  };
  project: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
  };
  projectName: string;
  propertyOwnerDeveloper: {
    entityType: string;
    name: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    fax: string;
    contactFirstName: string;
    contactLastName: string;
    contactPhone: string;
    contactEmail: string;
  } | null;
  status: string;
  trackoutDevices: {
    gravelPad: boolean;
    grizzlyRumbleGrate: boolean;
    wheelWash: boolean;
    pavedArea: boolean;
    other: boolean;
  };
  trackoutE1Answer: boolean | null;
  waterMethods: {
    hose: boolean;
    waterTruck: boolean;
    waterPull: boolean;
    waterBuffalo: boolean;
    other: boolean;
  };
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface PermitApplication {
  address?: string;
  applicationNumber: string;
  company: string;
  cost?: number;
  createdAt: string;
  effectiveAt?: string;
  error?: string;
  expiresAt?: string;
  id: string;
  invoiceNumber?: string;
  permitNumber?: string;
  permitStatus: string;
  projectName: string;
  requestStatus: "pending" | "running" | "needs_map" | "complete" | "failed";
  submittedAt?: string;
  updatedAt: string;
  version: number;
  versionType: "new" | "renewal" | "revision";
}

export interface DashboardPermit {
  address?: string;
  company: string;
  current: PermitApplication;
  history: PermitApplication[];
  permitNumber: string;
  projectName: string;
}

// ============================================================================
// Request Types
// ============================================================================

export interface ScrapePdfRequest {
  outputDir?: string;
  permitId: string;
}

export interface CreateRequest {
  companyName?: string;
  copyFromApp?: string;
  flow: "new-company" | "existing-company";
  /** Inline form data overrides (alternative to formDataPath). */
  formData?: Record<string, unknown>;
  /** Path to overrides JSON on the permit-worker filesystem. */
  formDataPath?: string;
}

export interface RenewRequest {
  companyName?: string;
}

export interface RenewAndPayRequest {
  companyName: string;
  expedited?: boolean;
}

export interface SubmitDraftAndPayRequest {
  applicationId?: string;
  expedited?: boolean;
}

export interface ReviseRequest {
  notes?: string;
  revisionType: string;
}

export interface CloseRequest {
  /**
   * Custom close reason.
   * Optional. If omitted, worker uses hardcoded default reason.
   */
  reason?: string;
}

export interface InvoicePdfRequest {
  invoiceNumber: string;
  outputDir?: string;
}

export interface BrowserAbortRequest {
  reason?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/** Base shape shared by most API responses. */
interface BaseResponse {
  error?: string;
  success: boolean;
  timestamp: string;
}

export interface ScrapePdfResponse extends BaseResponse {
  data?: PermitData;
  pdfBase64?: string;
  pdfPath?: string;
  permitId: string;
}

export interface ScrapeResponse extends BaseResponse {
  data?: PermitData;
  permitId: string;
}

export interface CreateResponse extends BaseResponse {
  applicationId?: string | null;
  flow?: string;
  reachedPage5?: boolean;
}

export interface RenewResponse extends BaseResponse {
  applicationId?: string | null;
}

export type RenewAndPayStage =
  | "renew-failed"
  | "page5-ready"
  | "submit-failed"
  | "submitted-no-payment"
  | "payment-page1"
  | "payment-continue-failed"
  | "payment-review"
  | "paid";

export type SubmitDraftAndPayStage =
  | "resume-failed"
  | "submit-failed"
  | "submitted-no-payment"
  | "payment-page1"
  | "payment-continue-failed"
  | "paid";

export interface RenewAndPayResponse extends BaseResponse {
  amount?: string;
  applicationId?: string;
  cardLastFour?: string;
  convenienceFee?: string;
  stage?: RenewAndPayStage;
  totalPaid?: string;
}

export interface SubmitDraftAndPayResponse extends BaseResponse {
  amount?: string;
  applicationId?: string;
  cardLastFour?: string;
  convenienceFee?: string;
  stage?: SubmitDraftAndPayStage;
  totalPaid?: string;
}

export interface CloseResponse extends BaseResponse {
  [key: string]: unknown;
}

export interface ReviseResponse extends BaseResponse {
  applicationId?: string | null;
  notes?: string | null;
  permitId?: string;
  revisionType?: string;
}

export interface DeleteResponse extends BaseResponse {
  deletedAll?: boolean;
  deletedDbCount?: number;
  message?: string;
}

export interface SyncStats {
  newRecords: number;
  totalInDb: number;
}

export interface SyncResponse extends BaseResponse {
  companyPermits?: SyncStats;
  marketingPermits?: SyncStats;
}

export interface InvoicePdfResponse extends BaseResponse {
  invoiceNumber?: string;
  pdfBase64?: string;
  pdfPath?: string;
  pdfUrl?: string;
}

export interface BrowserStatusResponse {
  active: boolean;
  busy: boolean;
  currentOperation: string | null;
  currentUrl: string | null;
  isLoggedIn: boolean;
  keepAliveEnabled: boolean;
  keepAliveIntervalMs: number;
  lastActivityAt: string | null;
  lastError: string | null;
  lastKeepAliveAt: string | null;
  lastLoginAt: string | null;
  portalReady: boolean;
  startedAt: string | null;
  timestamp: string;
  viewportHeight: number;
  viewportWidth: number;
}

export interface BrowserActionResponse extends BaseResponse {
  isLoggedIn?: boolean;
  keepAlive?: Record<string, unknown>;
  portalReady?: boolean;
  status?: Record<string, unknown>;
}

export interface BrowserAbortResponse extends BaseResponse {
  aborted?: {
    activeBeforeAbort: boolean;
    busyBeforeAbort: boolean;
    operation: string | null;
    reason: string;
    stopped: boolean;
  };
  status?: Record<string, unknown>;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchPermitsRequest {
  limit?: number;
  query: string;
}

export interface ExpiringPermitsRequest {
  days?: number;
}

// ============================================================================
// NOI Types
// ============================================================================

export interface NoiResolveRequest {
  /** Override company name (otherwise parsed from NOI record) */
  companyName?: string;
  /** Permit application ID to copy form data from */
  copyFromApp?: string;
  /** Override disturbed acres (otherwise parsed from NOI record) */
  disturbedAcres?: number;
  /** Force flow type (otherwise auto-determined from company check) */
  flow?: "new-company" | "existing-company";
  /** NOI identifier: AZC#, LTF#, or bare digits */
  identifier: string;
}

export interface NoiCreateRequest extends NoiResolveRequest {
  /** Set to false to dry-run (resolve + validate but don't create). Default: true */
  create?: boolean;
}

export interface NoiCompanyMatch {
  matchedName: string;
  permitCount: number;
  portalCompanyId: string | null;
}

export interface NoiResolveResponse {
  approvedForCreate: boolean;
  checks: Record<string, unknown>;
  companyMatch: NoiCompanyMatch | null;
  createPayload: {
    companyName?: string;
    copyFromApp?: string;
    flow: "new-company" | "existing-company";
    formData: Record<string, unknown>;
  };
  noi: Record<string, unknown>;
  success: boolean;
  timestamp: string;
}

export interface NoiCreateResponse extends NoiResolveResponse {
  create?: Record<string, unknown> | null;
  createSkipped?: boolean;
}

// ============================================================================
// Pima GIS Lookup Types
// ============================================================================

export interface PimaLookupRequest {
  /** Search by street address in Pima County */
  address?: string;
  /** Optional buffer for coordinate-based parcel lookup */
  distanceFeet?: number;
  /** AZDEQ NOI/LTF identifier */
  identifier?: string;
  /** Include parcel polygon geometry in response */
  includeGeometry?: boolean;
  /** Latitude for direct coordinate lookup */
  latitude?: number;
  /** Longitude for direct coordinate lookup */
  longitude?: number;
  /** Pima parcel/APN */
  parcel?: string;
}

export interface PimaLookupParcel {
  acres: number | null;
  address: string | null;
  centroid: { lat: number; lng: number } | null;
  owner: string | null;
  parcel: string;
  parcelDashed: string;
  parcelUse: string | null;
  polygon?: Array<{ lat: number; lng: number }>;
  rawAttributes: Record<string, unknown>;
}

export interface PimaLookupAddressCandidate {
  address: string;
  city: string | null;
  coordinates: { lat: number; lng: number } | null;
  parcel: string | null;
  primary: boolean | null;
  resolvedParcels: PimaLookupParcel[];
  zip: string | null;
}

export interface PimaLookupResponse extends BaseResponse {
  addressCandidates?: PimaLookupAddressCandidate[];
  noi?: {
    companyName: string | null;
    countyCode: string | null;
    facilityName: string | null;
    identifier: string;
    latitude: number;
    longitude: number;
    ltfIdno: string | null;
    permitAuthCode: string | null;
  };
  parcels: PimaLookupParcel[];
  query: {
    address?: string;
    distanceFeet?: number | null;
    identifier?: string;
    includeGeometry: boolean;
    latitude?: number;
    longitude?: number;
    mode: "address" | "coordinates" | "identifier" | "parcel";
    parcel?: string;
  };
}

// ============================================================================
// Maricopa GIS Lookup Types
// ============================================================================

export interface MaricopaLookupRequest {
  address?: string;
  identifier?: string;
  includeGeometry?: boolean;
  latitude?: number;
  longitude?: number;
  parcel?: string;
}

export interface MaricopaLookupParcel {
  acres: number | null;
  address: string | null;
  apn: string;
  apnDashed: string;
  centroid: { lat: number; lng: number };
  owner: string | null;
  polygon?: Array<{ lat: number; lng: number }>;
  rawAttributes: Record<string, unknown>;
}

export interface MaricopaLookupResponse extends BaseResponse {
  addressLookup?: {
    exact: MaricopaLookupParcel[];
    searchedStreet: string | null;
    similar: MaricopaLookupParcel[];
  };
  noi?: {
    companyName: string | null;
    countyCode: string | null;
    facilityName: string | null;
    identifier: string;
    latitude: number;
    longitude: number;
    ltfIdno: string | null;
    permitAuthCode: string | null;
  };
  parcels: MaricopaLookupParcel[];
  query: {
    address?: string;
    identifier?: string;
    includeGeometry: boolean;
    latitude?: number;
    longitude?: number;
    mode: "address" | "coordinates" | "identifier" | "parcel";
    parcel?: string;
    searchStrategy?: "exact" | "similar";
  };
}

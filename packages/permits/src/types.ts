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
  state: string;
  zip: string;
  parcel: string;
  latitude: string;
  longitude: string;
  isSelected: boolean;
}

export interface AccessPoint {
  latitude: string;
  longitude: string;
}

/** Complete scraped permit data from portal detail page. */
export interface PermitData {
  applicationId: string;
  projectName: string;
  companyName: string;
  status: string;
  createdDate: string;
  issueDate: string;
  expirationDate: string;
  contact: { email: string; name: string; phone: string };
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
  isOwnerDeveloper: boolean | null;
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
  disturbedArea: string;
  locations: PermitLocation[];
  accessPoints: AccessPoint[];
  trackoutE1Answer: boolean | null;
  trackoutDevices: {
    gravelPad: boolean;
    grizzlyRumbleGrate: boolean;
    wheelWash: boolean;
    pavedArea: boolean;
    other: boolean;
  };
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
  id: string;
  applicationNumber: string;
  permitNumber?: string;
  version: number;
  versionType: "new" | "renewal" | "revision";
  projectName: string;
  company: string;
  address?: string;
  requestStatus: "pending" | "running" | "needs_map" | "complete" | "failed";
  permitStatus: string;
  submittedAt?: string;
  effectiveAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  cost?: number;
  invoiceNumber?: string;
}

export interface DashboardPermit {
  permitNumber: string;
  company: string;
  projectName: string;
  address?: string;
  current: PermitApplication;
  history: PermitApplication[];
}

// ============================================================================
// Request Types
// ============================================================================

export interface ScrapePdfRequest {
  permitId: string;
  outputDir?: string;
}

export interface CreateRequest {
  flow: "new-company" | "existing-company";
  companyName?: string;
  copyFromApp?: string;
  formDataPath?: string;
}

export interface RenewRequest {
  companyName?: string;
}

export interface RenewAndPayRequest {
  companyName: string;
  expedited?: boolean;
}

export interface ReviseRequest {
  revisionType: string;
  notes?: string;
}

export interface CloseRequest {
  reason?: string;
}

export interface InvoicePdfRequest {
  invoiceNumber: string;
  outputDir?: string;
}

export interface ClipboardPasteRequest {
  text: string;
}

// ============================================================================
// Response Types
// ============================================================================

/** Base shape shared by most API responses. */
interface BaseResponse {
  success: boolean;
  timestamp: string;
  error?: string;
}

export interface ScrapePdfResponse extends BaseResponse {
  permitId: string;
  pdfPath?: string;
  pdfBase64?: string;
  data?: PermitData;
}

export interface ScrapeResponse extends BaseResponse {
  permitId: string;
  data?: PermitData;
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

export interface RenewAndPayResponse extends BaseResponse {
  applicationId?: string;
  stage?: RenewAndPayStage;
  amount?: string;
  convenienceFee?: string;
  totalPaid?: string;
  cardLastFour?: string;
}

export interface CloseResponse extends BaseResponse {
  [key: string]: unknown;
}

export interface ReviseResponse extends BaseResponse {
  applicationId?: string | null;
  permitId?: string;
  revisionType?: string;
  notes?: string | null;
}

export interface DeleteResponse extends BaseResponse {
  message?: string;
  deletedAll?: boolean;
  deletedDbCount?: number;
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
  pdfPath?: string;
  pdfUrl?: string;
  pdfBase64?: string;
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
  viewportHeight: number;
  viewportWidth: number;
  timestamp: string;
}

export interface BrowserActionResponse extends BaseResponse {
  isLoggedIn?: boolean;
  portalReady?: boolean;
  keepAlive?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

export interface ClipboardResponse extends BaseResponse {
  clipboard?: Record<string, unknown>;
  text?: string;
  status?: Record<string, unknown>;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

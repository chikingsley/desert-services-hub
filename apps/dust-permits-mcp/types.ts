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

export interface ClipboardPasteRequest {
  text: string;
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

export interface RenewAndPayResponse extends BaseResponse {
  amount?: string;
  applicationId?: string;
  cardLastFour?: string;
  convenienceFee?: string;
  stage?: RenewAndPayStage;
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

export interface ClipboardResponse extends BaseResponse {
  clipboard?: Record<string, unknown>;
  status?: Record<string, unknown>;
  text?: string;
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

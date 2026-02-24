/**
 * Portal Types
 *
 * All types for the Maricopa County dust permit portal automation.
 * Includes browser management, search, scraping, and form filling types.
 *
 * @module src/portal/types
 */

import type { Browser, BrowserContext, Page } from "playwright";

// ============================================================================
// Browser Types
// ============================================================================

/**
 * Browser instance containing browser, context, and page.
 */
export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

// ============================================================================
// Application Link Types
// ============================================================================

/**
 * Basic information about an application from a results table.
 */
export interface ApplicationLinkInfo {
  companyName?: string;
  id: string;
  index: number;
  projectName?: string;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Search criteria for finding permits.
 * Provide one of: permitId, projectName, or companyName.
 */
export interface SearchCriteria {
  /** Company name - autocomplete search */
  companyName?: string;
  /** Permit ID (D#) - exact match */
  permitId?: string;
  /** Project name - wildcard search */
  projectName?: string;
}

/**
 * Result of a search operation.
 */
export interface SearchResult {
  /** Number of results found */
  count: number;
  /** Error message if search failed */
  error?: string;
  /** Permit IDs found in results */
  permitIds: string[];
  success: boolean;
}

// ============================================================================
// Permit Location Types
// ============================================================================

/**
 * Location information from the permit's site location table.
 */
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

/**
 * Access point coordinates for the permit site.
 */
export interface AccessPoint {
  latitude: string;
  longitude: string;
}

// ============================================================================
// Permit Data (Extracted from Detail Page)
// ============================================================================

/**
 * Complete structured data extracted from a permit detail page.
 *
 * Contains all information from the application including:
 * - Header (application ID, status, dates)
 * - Contact information
 * - Applicant company and owner details
 * - Property owner/developer (if different from applicant)
 * - Primary project contact
 * - Project information
 * - Site location and access points
 * - Trackout control devices
 * - Water methods
 */
export interface PermitData {
  accessPoints: AccessPoint[];

  // Applicant Company
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

  // Applicant President/Owner
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
  // Header
  applicationId: string;
  companyName: string;

  // Contact (where permit is sent)
  contact: {
    email: string;
    name: string;
    phone: string;
  };
  createdDate: string;

  // Site Location
  disturbedArea: string;
  expirationDate: string;

  // Is Applicant Owner/Developer (Yes/No)
  isOwnerDeveloper: boolean | null;
  issueDate: string;
  locations: PermitLocation[];

  // Primary Project Contact
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

  // Project Info
  project: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
  };
  projectName: string;

  // Property Owner/Developer (only present when isOwnerDeveloper = false)
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

  // Trackout Control Devices (E1)
  // E1 answer: true = "Yes" (has 2+ acres or 100+ cubic yards), false = "No", null = not found
  trackoutE1Answer: boolean | null;

  // Water Methods
  waterMethods: {
    hose: boolean;
    waterTruck: boolean;
    waterPull: boolean;
    waterBuffalo: boolean;
    other: boolean;
  };
}

// ============================================================================
// Scrape Flow Types
// ============================================================================

/**
 * Configuration for the scrape flow.
 */
export interface ScrapeFlowConfig {
  /** Callback to check if permit exists in DB */
  existsInDb: (permitId: string) => boolean | Promise<boolean>;
  /** Callback to save permit to DB */
  saveToDb: (data: PermitData) => void | Promise<void>;
  /** Statuses to filter by */
  statuses?: ("Active" | "Closed" | "Rejected" | "Submitted" | "Superseded")[];
  /** Number of NEW applications to scrape (not already in DB) */
  targetCount: number;
}

/**
 * Result of a scrape flow execution.
 */
export interface ScrapeFlowResult {
  errors: { permitId: string; error: string }[];
  scraped: string[];
  skipped: string[];
  success: boolean;
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * Valid permit status values for filtering.
 */
export type PermitStatus =
  | "Active"
  | "Closed"
  | "Rejected"
  | "Submitted"
  | "Superseded";

// ============================================================================
// Create Flow Types
// ============================================================================

/**
 * Application flow types for creating/revising permits.
 */
export type ApplicationFlow =
  | "new-company"
  | "existing-company"
  | "renew"
  | "revise";

/**
 * Options for the new application popup handler (create/copy-from flows).
 */
export interface NewAppPopupOptions {
  companyName?: string;
  copyFromApp: string;
  flow: "new-company" | "existing-company";
}

/**
 * Options for the revise application popup handler.
 * Used when revising an existing active permit (doesn't extend expiration).
 */
export interface ReviseAppPopupOptions {
  flow: "revise";
  /** The D# of the permit to revise */
  revisionApp: string;
  /** Required reason/purpose for the revision (max 1000 chars) */
  revisionPurpose: string;
}

/**
 * Result of creating a new application.
 */
export interface CreateResult {
  applicationId: string | null;
  error?: string;
  success: boolean;
}

/**
 * Extended result for full create flow including page 5 status.
 */
export interface FullCreateResult extends CreateResult {
  reachedPage5: boolean;
}

// ============================================================================
// Payment Types (Point & Pay)
// ============================================================================

/**
 * Result of clicking "Submit Application" on Page 5.
 */
export interface SubmitResult {
  applicationId: string | null;
  error?: string;
  /** Current URL after submit */
  finalUrl?: string;
  /** Whether we were redirected to Point & Pay */
  redirectedToPayment: boolean;
  success: boolean;
}

/**
 * Result of completing payment on Point & Pay.
 */
export interface PaymentResult {
  /** Total amount displayed (e.g. "$4,120.00") */
  amount?: string;
  /** Last 4 digits of card used */
  cardLastFour?: string;
  convenienceFee?: string;
  /** Whether this was a dry run (stopped before clicking Pay) */
  dryRun: boolean;
  error?: string;
  success: boolean;
  totalPaid?: string;
}

/**
 * Detailed report of which payment fields were filled successfully.
 */
export interface PaymentFillReport {
  failedFields: string[];
  filledFields: string[];
  success: boolean;
}

// Re-export from form-data.ts (canonical location for all form data + page states)
export type {
  Page1State,
  Page3State,
  Page4State,
  Page5State,
} from "@/form-data";

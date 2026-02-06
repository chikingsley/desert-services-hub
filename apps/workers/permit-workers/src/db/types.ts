/**
 * Database Types
 *
 * Type definitions for all database entities across dust and sales databases.
 * Includes companies, permits, jobs, contacts, and export records.
 *
 * @module src/db/types
 */

// ============================================================================
// Dust Database Types
// ============================================================================

/**
 * Contractor company we do permits for.
 */
export interface Company {
  id: string;
  name: string;
  entityType: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Permit we've created or manage.
 */
export interface Permit {
  id: string;
  projectName: string | null;
  companyId: string | null;
  companyName: string | null;
  status: string | null;
  submittedDate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  closedDate: string | null;
  previousAppId: string | null;
  projectStartDate: string | null;
  projectEndDate: string | null;
  address: string | null;
  city: string | null;
  parcel: string | null;
  isBlockPermit: boolean;
  isAccelerated: boolean;
}

/**
 * Automation job in the queue (create, renew, close).
 */
export interface Job {
  id: number;
  type: "create" | "renew" | "close";
  permitId: string | null;
  companyId: string | null;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed";
  result: Record<string, unknown> | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

/**
 * Valid job types for automation queue.
 */
export type JobType = Job["type"];

/**
 * Valid job statuses.
 */
export type JobStatus = Job["status"];

// ============================================================================
// Sales Database Types
// ============================================================================

/**
 * Permit scraped from the portal (lead for sales team).
 */
export interface ScrapedPermit {
  id: string;
  projectName: string | null;
  companyId: string | null;
  companyName: string | null;
  status: string | null;
  submittedDate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  closedDate: string | null;
  previousAppId: string | null;
  projectStartDate: string | null;
  projectEndDate: string | null;
  address: string | null;
  city: string | null;
  parcel: string | null;
  isBlockPermit: boolean;
  isAccelerated: boolean;
  invoiceNumber: string | null;
  invoiceCharges: number | null;
  invoiceBalance: number | null;
  rawData: Record<string, unknown> | null;
  scrapedAt: number | null;
  detailScrapedAt: number | null;
}

/**
 * Enriched contact info for outreach.
 */
export interface Contact {
  id: number;
  companyId: string | null;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  source: "scraped" | "enriched" | "manual";
}

/**
 * Valid contact source types.
 */
export type ContactSource = Contact["source"];

/**
 * Record of data exported to CRM or files.
 */
export interface Export {
  id: number;
  type: string;
  filter: Record<string, unknown>;
  recordCount: number;
  filePath: string | null;
  createdAt: number;
}

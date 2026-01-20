/**
 * CGP Scrape Types
 *
 * Type definitions for the CGP (Construction General Permit) scraper.
 */

import type { Browser, BrowserContext, Page } from "playwright";

// =============================================================================
// BROWSER TYPES
// =============================================================================

export type BrowserInstance = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

// =============================================================================
// SEARCH CRITERIA
// =============================================================================

export type ApplicationType = "General Construction" | "Waiver Construction";

export type County =
  | "Apache"
  | "Cochise"
  | "Coconino"
  | "Gila"
  | "Graham"
  | "Greenlee"
  | "La Paz"
  | "Maricopa"
  | "Mohave"
  | "Navajo"
  | "Pima"
  | "Pinal"
  | "Santa Cruz"
  | "Yavapai"
  | "Yuma";

export type SearchCriteria = {
  /** Filter by application type */
  applicationType?: ApplicationType;
  /** Filter by AZPDES number (exact or partial) */
  azpdesNumber?: string;
  /** Filter by operator business name */
  businessName?: string;
  /** Filter by project/site name */
  projectSiteName?: string;
  /** Filter by site city */
  siteCity?: string;
  /** Filter by site zip code */
  siteZip?: string;
  /** Filter by county */
  county?: County;
  /** Start date for date range filter (mm/dd/yyyy) */
  startDate?: string;
  /** End date for date range filter (mm/dd/yyyy) */
  endDate?: string;
};

// =============================================================================
// PERMIT RECORD
// =============================================================================

export type PermitRecord = {
  /** AZPDES permit number (e.g., "AZG2024-001234") */
  azpdesNumber: string;
  /** Operator/company business name */
  operatorBusinessName: string;
  /** Project or site name */
  projectSiteName: string;
  /** Application status (e.g., "Active", "Closed", "Submitted") */
  applicationStatus: string;
  /** Date received (mm/dd/yyyy format) */
  receivedDate: string;
};

// =============================================================================
// SCRAPE RESULTS
// =============================================================================

export type ScrapeResult = {
  /** Whether the scrape was successful */
  success: boolean;
  /** Total number of permits found (across all pages) */
  totalCount: number;
  /** Scraped permit records */
  permits: PermitRecord[];
  /** Number of pages scraped */
  pageCount: number;
  /** Any errors encountered */
  errors: string[];
};

export type PageScrapeResult = {
  /** Whether this page scrape was successful */
  success: boolean;
  /** Permits found on this page */
  permits: PermitRecord[];
  /** Whether there are more pages */
  hasMore: boolean;
  /** Current page number */
  currentPage: number;
  /** Error message if failed */
  error?: string;
};

// =============================================================================
// SCRAPER OPTIONS
// =============================================================================

export type ScraperOptions = {
  /** Run in headless mode (default: true) */
  headless?: boolean;
  /** Maximum pages to scrape (default: all) */
  maxPages?: number;
  /** Delay between page navigations in ms (default: 1000) */
  pageDelay?: number;
  /** Timeout for page loads in ms (default: 30000) */
  timeout?: number;
};

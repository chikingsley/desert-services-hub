/**
 * CGP (Construction General Permit) Selectors
 *
 * Type-safe selectors for the ADEQ AZPDES Notice of Intent
 * Construction Stormwater General Permit Database Search.
 *
 * URL: https://legacy.azdeq.gov/databases/azpdessearch_drupal.html
 */

// =============================================================================
// SEARCH FORM SELECTORS
// =============================================================================

/** Application Type dropdown */
export const appType = {
  select: "select#App\\ Type",
  options: {
    generalConstruction: "General Construction",
    waiverConstruction: "Waiver Construction",
  },
} as const;

/** AZPDES Number input */
export const azpdesNumber = {
  input: "input#AZPDES\\ No",
} as const;

/** Business Name input */
export const businessName = {
  input: "input#Operator\\ Business\\ Name",
} as const;

/** Project/Site Name input */
export const projectSiteName = {
  input: "input#Project\\ Site\\ Name",
} as const;

/** Project/Site City input */
export const siteCity = {
  input: "input#Site\\ City",
} as const;

/** Project/Site Zip Code input */
export const siteZip = {
  input: "input#Site\\ Zip",
} as const;

/** Facility County dropdown */
export const county = {
  select: "select#County",
  options: {
    apache: "Apache",
    cochise: "Cochise",
    coconino: "Coconino",
    gila: "Gila",
    graham: "Graham",
    greenlee: "Greenlee",
    laPaz: "La Paz",
    maricopa: "Maricopa",
    mohave: "Mohave",
    navajo: "Navajo",
    pima: "Pima",
    pinal: "Pinal",
    santaCruz: "Santa Cruz",
    yavapai: "Yavapai",
    yuma: "Yuma",
  },
} as const;

/** Date range inputs */
export const dateRange = {
  startDate: "input#Start\\ Date",
  endDate: "input#End\\ Date",
} as const;

/** Form buttons */
export const formButtons = {
  search: 'input[type="submit"][value="Search"]',
  clear: 'input[type="reset"][value="Clear"]',
} as const;

// =============================================================================
// SEARCH FORM (COMBINED)
// =============================================================================

export const searchForm = {
  /** Form element */
  form: 'form[action="/cgi-bin/databases/azpdes.pl"]',
  appType,
  azpdesNumber,
  businessName,
  projectSiteName,
  siteCity,
  siteZip,
  county,
  dateRange,
  buttons: formButtons,
} as const;

// =============================================================================
// RESULTS PAGE SELECTORS (to be defined after inspecting results page)
// =============================================================================

export const resultsPage = {
  /** Pagination links */
  pagination: {
    pageLinks: "font > font > a",
    nextPage: 'a:has-text("Next")',
    prevPage: 'a:has-text("Prev")',
  },
  /** Results table */
  table: {
    container: "table",
    rows: "table tr",
    headerRow: "table tr:first-child",
    dataRows: "table tr:not(:first-child)",
  },
} as const;

// =============================================================================
// COMBINED SELECTORS EXPORT
// =============================================================================

export const selectors = {
  searchForm,
  resultsPage,
} as const;

export type Selectors = typeof selectors;

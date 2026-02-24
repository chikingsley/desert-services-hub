/**
 * Scraper Utilities
 *
 * Handles listing, navigating to, and extracting data from permit applications.
 * Provides functions for searching, filtering, and extracting structured data
 * from the Maricopa County dust permit portal.
 *
 * Uses pure Playwright without Stagehand dependencies.
 *
 * @module src/portal/scrape
 *
 * @example
 * // List applications and click on one
 * const apps = await listApplications(page);
 * const { success, appId } = await clickApplicationByIndex(page, 0);
 *
 * @example
 * // Extract structured data from a permit detail page
 * const data = await extractPermitData(page);
 * console.log(data.projectName, data.status);
 */

import type { Page } from "playwright";
import type { PermitData, ScrapeFlowConfig, ScrapeFlowResult } from "./types";
import type { ApplicationLinkInfo } from "./utils/helpers";
import {
  clickDustApplicationLinkByIndex,
  DUST_APPLICATION_ID_REGEX,
  listApplicationIds,
  navigateToDustSearch,
  navigateToMyDustApps,
  SETTLE_MS,
  sleep,
  triggerLazyLoad,
  waitForDustApplicationDetailPage,
  waitForElement,
} from "./utils/helpers";
import { portal } from "./utils/selectors";

export type {
  AccessPoint,
  PermitData,
  PermitLocation,
  PermitStatus,
  ScrapeFlowConfig,
  ScrapeFlowResult,
} from "./types";

/** Playwright locator pattern for permit ID links using the shared regex */
const PERMIT_ID_LINK_LOCATOR = `a:text-matches("${DUST_APPLICATION_ID_REGEX.source}")`;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Safety cap for location row iteration - portal has no documented limit */
const MAX_LOCATION_ROWS = 10;

/** Safety cap for access point row iteration - portal has no documented limit */
const MAX_ACCESS_POINT_ROWS = 20;

/**
 * Get a list of all applications from the search results table.
 *
 * Scans the page for links matching the dust application ID pattern
 * (D followed by 7 digits) and extracts basic info from the table rows.
 *
 * @param page - Playwright Page instance (on search results page)
 * @returns Array of ApplicationLinkInfo objects with id, index, and optional names
 */
export async function listApplications(
  page: Page
): Promise<ApplicationLinkInfo[]> {
  console.log("\n[LIST APPLICATIONS]");
  const apps = await listApplicationIds(page);
  console.log(`  Found ${apps.length} applications`);
  if (apps.length > 0) {
    console.log("  First 5:");
    for (const app of apps.slice(0, 5)) {
      console.log(
        `    [${app.index}] ${app.id} - ${app.projectName || "(no name)"}`
      );
    }
    if (apps.length > 5) {
      console.log(`    ... and ${apps.length - 5} more`);
    }
  }

  return apps;
}

/**
 * Click on an application link by its index to open the detail page.
 *
 * Scrolls to the top of the page, finds the link at the specified index,
 * clicks it, and waits for the detail page to load.
 *
 * @param page - Playwright Page instance (on search results page)
 * @param index - Zero-based index of the application link to click
 * @returns Object with success status and the clicked application ID
 */
export async function clickApplicationByIndex(
  page: Page,
  index: number
): Promise<{ success: boolean; appId: string }> {
  console.log(`\n[CLICK APPLICATION ${index}]`);

  // Scroll to top before finding links
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(SETTLE_MS);

  const result = await clickDustApplicationLinkByIndex(page, index);
  if (!result.success) {
    console.log(`  ✗ Application at index ${index} not found`);
    return { appId: "", success: false };
  }

  console.log(`  Found: ${result.appId}, waiting for detail page...`);

  // Wait for navigation to detail page using shared helper
  await waitForDustApplicationDetailPage(page);
  console.log("  ✓ Detail page loaded");
  return { appId: result.appId, success: true };
}

/** Search status type — subset of PermitStatus values available in the portal search dropdown */
type SearchStatus =
  | "Active"
  | "Closed"
  | "Rejected"
  | "Submitted"
  | "Superseded";

/** All statuses — use when searching for a specific permit by ID */
export const ALL_STATUSES: SearchStatus[] = [
  "Active",
  "Closed",
  "Rejected",
  "Submitted",
  "Superseded",
];

// Status values map (matches the dropdown option values)
const STATUS_MAP: Record<string, string> = {
  Active: "0",
  Closed: "1",
  Rejected: "2",
  Submitted: "3",
  Superseded: "4",
};

/**
 * Set status filters in the dropdown WITHOUT submitting the form.
 * Use this before searchPermits() so a single submit includes both
 * the filters and the search criteria.
 */
export async function setStatusFilters(
  page: Page,
  statuses: SearchStatus[]
): Promise<boolean> {
  console.log(`\n[SET FILTERS: ${statuses.join(", ")}]`);

  const valuesToSelect = statuses
    .map((s) => STATUS_MAP[s])
    .filter((v): v is string => v !== undefined);

  const selected = await page.evaluate(
    ({ values, statusSel }) => {
      const select = document.querySelector(
        statusSel
      ) as HTMLSelectElement | null;
      if (!select) {
        return { reason: "select not found", success: false };
      }

      for (const option of [...select.options]) {
        option.selected = values.includes(option.value);
      }

      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { reason: "", success: true };
    },
    { statusSel: portal.dustSearch.statusDropdown, values: valuesToSelect }
  );

  if (!selected.success) {
    console.log(`  ✗ ${selected.reason}`);
    return false;
  }
  console.log(`  ✓ Selected: ${statuses.join(", ")}`);

  await sleep(SETTLE_MS);
  return true;
}

/**
 * Select status filters in the search form and submit.
 * Used by goBackToSearch() and runScrapeFlow() which need to load
 * a full results list (not searching by a specific permit ID).
 */
export async function selectFiltersAndSubmit(
  page: Page,
  statuses: SearchStatus[]
): Promise<boolean> {
  const filtersSet = await setStatusFilters(page, statuses);
  if (!filtersSet) {
    return false;
  }

  // Click submit
  await page.locator(portal.dustSearch.submitLink).first().click();

  // Wait for results table to appear first (more reliable than waiting for links)
  const tableSelector = '[id*="dcpSearchTable"]';
  const tableVisible = await waitForElement(page, tableSelector, 30_000);
  if (!tableVisible) {
    console.log("  ⚠ Results table did not appear");
    return false;
  }

  // Give the table a moment to fully render
  await sleep(SETTLE_MS);

  // Now check if permit links exist using listApplicationIds (more reliable)
  const apps = await listApplicationIds(page);
  const hasResults = apps.length > 0;

  if (hasResults) {
    console.log(`  ✓ Found ${apps.length} permits`);
  } else {
    console.log("  ⚠ No permits found matching filters");
  }
  return hasResults;
}

/**
 * Navigate back to search results by re-navigating.
 *
 * ADF doesn't preserve form state reliably with browser back,
 * so this function re-navigates to the search page and reapplies filters.
 *
 * @param page - Playwright Page instance
 * @param statuses - Statuses to filter by (default: ["Active", "Submitted"])
 * @returns True if navigation succeeded and apps were found
 */
export async function goBackToSearch(
  page: Page,
  statuses: SearchStatus[] = ["Active", "Submitted"]
): Promise<boolean> {
  console.log("\n[GO BACK]");

  try {
    await navigateToMyDustApps(page);
    await navigateToDustSearch(page);

    // Check if results already exist in DOM (cached from previous search)
    const hasResults = await page
      .locator(PERMIT_ID_LINK_LOCATOR)
      .count()
      .catch(() => 0);
    if (hasResults > 0) {
      console.log("  ✓ Results already present");
      return true;
    }

    // Otherwise, select filters and submit
    await selectFiltersAndSubmit(page, statuses);
    return true;
  } catch (error) {
    console.log(`  ✗ Navigation error: ${error}`);
    return false;
  }
}

// ============================================================================
// STRUCTURED DATA EXTRACTION
// ============================================================================

/**
 * Extract structured permit data from the detail page.
 *
 * Triggers lazy-loading to ensure all content is visible, then extracts
 * all permit information using DOM portal. Returns a complete PermitData
 * object with header, contact, applicant, project, location, and control
 * device information.
 *
 * @param page - Playwright Page instance (on permit detail page)
 * @returns Complete PermitData object with all extracted information
 *
 * @example
 * const data = await extractPermitData(page);
 * console.log(`Project: ${data.projectName}`);
 * console.log(`Status: ${data.status}`);
 * console.log(`Locations: ${data.locations.length}`);
 */
export async function extractPermitData(page: Page): Promise<PermitData> {
  console.log("\n[EXTRACT PERMIT DATA]");

  // ADF pages use lazy-loading - we need to scroll through the entire page
  // to trigger all disclosure panels to load their content.
  // Use incremental scrolling to ensure all content loads.
  await triggerLazyLoad(page);

  const data = await page.evaluate(
    ({ sels, maxLocationRows, maxAccessPointRows }) => {
      // Helper: get text content from element
      const getText = (selector: string): string => {
        const el = document.querySelector(selector);
        if (!el) {
          return "";
        }
        // For textarea, get value; for span/div, get textContent
        if (el.tagName === "TEXTAREA") {
          return (el as HTMLTextAreaElement).value?.trim() || "";
        }
        return el.textContent?.trim() || "";
      };

      // Helper: check if checkbox is checked (img src contains checkrc.gif)
      const isChecked = (selector: string): boolean => {
        const span = document.querySelector(selector);
        if (!span) {
          return false;
        }
        const img = span.querySelector("img");
        return img?.src?.includes("checkrc") ?? false;
      };

      // Helper: check if radio is selected (img src contains radiors.gif)
      const isRadioSelected = (selector: string): boolean => {
        const span = document.querySelector(selector);
        if (!span) {
          return false;
        }
        const img = span.querySelector("img");
        return img?.src?.includes("radiors") ?? false;
      };

      // Helper: get location row data
      const getLocationRow = (index: number) => {
        const replace = (s: string) => s.replace("{N}", String(index));
        return {
          address: getText(replace(sels.siteLocation.locationRow.address)),
          city: getText(replace(sels.siteLocation.locationRow.city)),
          county: getText(replace(sels.siteLocation.locationRow.county)),
          isSelected: isRadioSelected(
            replace(sels.siteLocation.locationRow.selectRadio)
          ),
          latitude: getText(replace(sels.siteLocation.locationRow.latitude)),
          longitude: getText(replace(sels.siteLocation.locationRow.longitude)),
          parcel: getText(replace(sels.siteLocation.locationRow.parcel)),
          state: getText(replace(sels.siteLocation.locationRow.state)),
          zip: getText(replace(sels.siteLocation.locationRow.zip)),
        };
      };

      // Helper: get access point row data
      const getAccessPointRow = (index: number) => {
        const replace = (s: string) => s.replace("{N}", String(index));
        return {
          latitude: getText(replace(sels.siteLocation.accessPointRow.latitude)),
          longitude: getText(
            replace(sels.siteLocation.accessPointRow.longitude)
          ),
        };
      };

      // Count location rows (look for table rows)
      const locationsTable = document.querySelector(
        sels.siteLocation.locationsTable
      );
      const locationRows: ReturnType<typeof getLocationRow>[] = [];
      if (locationsTable) {
        for (let i = 0; i < maxLocationRows; i++) {
          const row = getLocationRow(i);
          if (row.address || row.latitude) {
            locationRows.push(row);
          } else {
            break;
          }
        }
      }

      // Count access point rows
      const accessPointsTable = document.querySelector(
        sels.siteLocation.accessPointsTable
      );
      const accessPointRows: ReturnType<typeof getAccessPointRow>[] = [];
      if (accessPointsTable) {
        for (let i = 0; i < maxAccessPointRows; i++) {
          const row = getAccessPointRow(i);
          if (row.latitude || row.longitude) {
            accessPointRows.push(row);
          } else {
            break;
          }
        }
      }

      return {
        // Header
        applicationId: getText(sels.header.applicationId),
        projectName: getText(sels.header.projectName),
        companyName: getText(sels.header.companyName),
        status: getText(sels.header.status),
        createdDate: getText(sels.header.createdDate),
        issueDate: getText(sels.header.issueDate),
        expirationDate: getText(sels.header.expirationDate),

        // Contact
        contact: {
          email: getText(sels.contact.email),
          name: getText(sels.contact.name),
          phone: getText(sels.contact.phone),
        },

        // Applicant Company
        applicantCompany: {
          address1: getText(sels.applicantCompany.address1),
          address2: getText(sels.applicantCompany.address2),
          city: getText(sels.applicantCompany.city),
          email: getText(sels.applicantCompany.email),
          entityType: getText(sels.applicantCompany.entityType),
          name: getText(sels.applicantCompany.companyName),
          phone: getText(sels.applicantCompany.phone),
          state: getText(sels.applicantCompany.state),
          zip: getText(sels.applicantCompany.zip),
        },

        // Applicant Owner
        applicantOwner: {
          address1: getText(sels.applicantOwner.address1),
          address2: getText(sels.applicantOwner.address2),
          city: getText(sels.applicantOwner.city),
          email: getText(sels.applicantOwner.email),
          firstName: getText(sels.applicantOwner.firstName),
          lastName: getText(sels.applicantOwner.lastName),
          phone: getText(sels.applicantOwner.phone),
          state: getText(sels.applicantOwner.state),
          zip: getText(sels.applicantOwner.zip),
        },

        // Is Owner/Developer - check both possible selector locations
        isOwnerDeveloper: (() => {
          // Try primary location (siTable:7)
          const yesSelected = isRadioSelected(sels.isOwnerDeveloper.yesRadio);
          const noSelected = isRadioSelected(sels.isOwnerDeveloper.noRadio);
          if (yesSelected) {
            return true;
          }
          if (noSelected) {
            return false;
          }
          // Try alternate location (siTable:6)
          const yesSelectedAlt = isRadioSelected(
            sels.isOwnerDeveloperAlt.yesRadio
          );
          const noSelectedAlt = isRadioSelected(
            sels.isOwnerDeveloperAlt.noRadio
          );
          if (yesSelectedAlt) {
            return true;
          }
          if (noSelectedAlt) {
            return false;
          }
          return null;
        })(),

        // Property Owner/Developer (only present when isOwnerDeveloper = false)
        propertyOwnerDeveloper: (() => {
          const hasSection = getText(sels.propertyOwnerDeveloper.name);
          if (!hasSection) {
            return null;
          }
          return {
            address1: getText(sels.propertyOwnerDeveloper.address1),
            address2: getText(sels.propertyOwnerDeveloper.address2),
            city: getText(sels.propertyOwnerDeveloper.city),
            contactEmail: getText(sels.propertyOwnerDeveloper.contactEmail),
            contactFirstName: getText(
              sels.propertyOwnerDeveloper.contactFirstName
            ),
            contactLastName: getText(
              sels.propertyOwnerDeveloper.contactLastName
            ),
            contactPhone: getText(sels.propertyOwnerDeveloper.contactPhone),
            entityType: getText(sels.propertyOwnerDeveloper.entityType),
            fax: getText(sels.propertyOwnerDeveloper.fax),
            name: getText(sels.propertyOwnerDeveloper.name),
            phone: getText(sels.propertyOwnerDeveloper.phone),
            state: getText(sels.propertyOwnerDeveloper.state),
            zip: getText(sels.propertyOwnerDeveloper.zip),
          };
        })(),

        // Primary Contact
        primaryContact: {
          companyName: getText(sels.primaryContact.companyName),
          email: getText(sels.primaryContact.email),
          fax: getText(sels.primaryContact.fax),
          firstName: getText(sels.primaryContact.firstName),
          lastName: getText(sels.primaryContact.lastName),
          mobile: getText(sels.primaryContact.mobile),
          onSitePhone: getText(sels.primaryContact.onSitePhone),
          title: getText(sels.primaryContact.title),
        },

        // Project
        project: {
          description: getText(sels.project.description),
          endDate: getText(sels.project.endDate),
          name: getText(sels.project.name),
          startDate: getText(sels.project.startDate),
        },

        // Site Location
        disturbedArea: getText(sels.siteLocation.disturbedArea),
        locations: locationRows,
        accessPoints: accessPointRows,

        // Trackout E1 Answer (Yes/No radio)
        trackoutE1Answer: (() => {
          const yesSelected = isRadioSelected(sels.trackoutE1.yesRadio);
          const noSelected = isRadioSelected(sels.trackoutE1.noRadio);
          if (yesSelected) {
            return true;
          }
          if (noSelected) {
            return false;
          }
          return null;
        })(),

        // Trackout Devices (only visible when E1 = Yes)
        trackoutDevices: {
          gravelPad: isChecked(sels.trackoutDevices.gravelPad),
          grizzlyRumbleGrate: isChecked(
            sels.trackoutDevices.grizzlyRumbleGrate
          ),
          other: isChecked(sels.trackoutDevices.other),
          pavedArea: isChecked(sels.trackoutDevices.pavedArea),
          wheelWash: isChecked(sels.trackoutDevices.wheelWash),
        },

        // Water Methods
        waterMethods: {
          hose: isChecked(sels.waterMethods.hose),
          other: isChecked(sels.waterMethods.other),
          waterBuffalo: isChecked(sels.waterMethods.waterBuffalo),
          waterPull: isChecked(sels.waterMethods.waterPull),
          waterTruck: isChecked(sels.waterMethods.waterTruck),
        },
      };
    },
    {
      maxAccessPointRows: MAX_ACCESS_POINT_ROWS,
      maxLocationRows: MAX_LOCATION_ROWS,
      sels: portal.detailExtract,
    }
  );

  // Helper for boolean | null → display string
  const formatBooleanAnswer = (value: boolean | null): string => {
    if (value === null) {
      return "unknown";
    }
    return value ? "Yes" : "No";
  };

  // Log summary
  console.log(`  Application: ${data.applicationId}`);
  console.log(`  Project: ${data.projectName}`);
  console.log(`  Company: ${data.companyName}`);
  console.log(`  Status: ${data.status}`);
  console.log(
    `  Is Owner/Developer: ${formatBooleanAnswer(data.isOwnerDeveloper)}`
  );
  if (data.propertyOwnerDeveloper) {
    console.log(
      `  Property Owner: ${data.propertyOwnerDeveloper.name} (${data.propertyOwnerDeveloper.entityType})`
    );
  }
  console.log(`  Disturbed Area: ${data.disturbedArea}`);
  console.log(`  Locations: ${data.locations.length}`);
  console.log(`  Access Points: ${data.accessPoints.length}`);

  // Trackout E1 answer
  const e1Answer = formatBooleanAnswer(data.trackoutE1Answer);
  console.log(`  Trackout E1 (2+ acres/100+ cubic yards): ${e1Answer}`);

  const trackoutActive = Object.entries(data.trackoutDevices)
    .filter(([, v]) => v)
    .map(([k]) => k);
  console.log(`  Trackout Devices: ${trackoutActive.join(", ") || "(none)"}`);

  const waterActive = Object.entries(data.waterMethods)
    .filter(([, v]) => v)
    .map(([k]) => k);
  console.log(`  Water Methods: ${waterActive.join(", ") || "(none)"}`);

  return data;
}

// ============================================================================
// HIGH-LEVEL SCRAPE FLOW
// ============================================================================

/**
 * Run a complete scrape flow: filter → iterate → extract → save
 *
 * This is the high-level orchestration function that encapsulates the
 * entire scraping workflow. It handles:
 * - Applying status filters
 * - Iterating through applications
 * - Skipping already-scraped permits
 * - Extracting data from each permit
 * - Saving to database via callback
 * - Navigating back to search between permits
 *
 * @param page - Playwright Page instance (must be on search page)
 * @param config - Configuration for the flow
 * @returns ScrapeFlowResult with scraped/skipped/error counts
 *
 * @example
 * const result = await runScrapeFlow(page, {
 *   targetCount: 5,
 *   statuses: ["Active", "Submitted"],
 *   existsInDb: (id) => getPermit(id) !== undefined,
 *   saveToDb: (data) => upsertPermit({ ... }),
 * });
 */
export async function runScrapeFlow(
  page: Page,
  config: ScrapeFlowConfig
): Promise<ScrapeFlowResult> {
  const {
    targetCount,
    statuses = ["Active", "Submitted"],
    existsInDb,
    saveToDb,
  } = config;

  console.log(`\n[SCRAPE FLOW] Target: ${targetCount} permits`);

  const result: ScrapeFlowResult = {
    errors: [],
    scraped: [],
    skipped: [],
    success: false,
  };

  // Step 1: Apply filters
  const filterSuccess = await selectFiltersAndSubmit(page, statuses);
  if (!filterSuccess) {
    result.errors.push({ error: "Failed to apply filters", permitId: "" });
    return result;
  }

  // Step 2: Iterate through applications
  let index = 0;

  while (result.scraped.length < targetCount) {
    const apps = await listApplications(page);
    if (index >= apps.length) {
      console.log("  No more apps on page");
      break;
    }

    const app = apps[index];
    if (!app) {
      index++;
      continue;
    }

    const permitId = app.id;
    console.log(`\n[${index}] ${permitId} - ${app.projectName || "(no name)"}`);

    // Check if already in DB
    if (await existsInDb(permitId)) {
      console.log("  → Skipping (already in DB)");
      result.skipped.push(permitId);
      index++;
      continue;
    }

    // Click into application
    const click = await clickApplicationByIndex(page, index);
    if (!click.success) {
      console.log("  ✗ Failed to click");
      result.errors.push({ error: "Failed to click application", permitId });
      index++;
      continue;
    }

    // Extract data
    try {
      const data = await extractPermitData(page);
      await saveToDb(data);
      console.log(`  ✓ Saved: ${data.applicationId}`);
      result.scraped.push(data.applicationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Extract failed: ${message}`);
      result.errors.push({ error: message, permitId });
    }

    // Navigate back
    const back = await goBackToSearch(page, statuses);
    if (!back) {
      console.log("  ✗ Failed to navigate back");
      result.errors.push({ error: "Failed to navigate back", permitId: "" });
      break;
    }

    index++;
  }

  // Summary
  console.log("\n=== SCRAPE FLOW RESULTS ===");
  console.log(
    `  Scraped: ${result.scraped.length} (${result.scraped.join(", ")})`
  );
  console.log(
    `  Skipped: ${result.skipped.length} (${result.skipped.join(", ")})`
  );
  console.log(`  Errors: ${result.errors.length}`);

  result.success = result.scraped.length >= targetCount;
  return result;
}

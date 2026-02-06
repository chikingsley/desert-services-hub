/**
 * Page 2 State Verification
 *
 * Checks the current state of Page 2 (Project Location) form fields.
 * Used exclusively in E2E tests for assertions.
 *
 * Page 2 contains:
 * - Disturbed area acreage (from site drawing)
 * - Location table (address, city, state, zip, parcel, coordinates)
 * - Access points table (coordinates)
 */

import type { Page } from "playwright";
import { portal } from "@/portal/utils/selectors";

/** Page 2 selectors for site location data */
const page2Selectors = {
  disturbedArea: '[id="ThePage:siTable:12:_idJsp173"]',
  locationsTable: '[id="ThePage:siTable:12:locations"]',
  locationRow: {
    address: '[id="ThePage:siTable:12:locations:{N}:_idJsp192"]',
    city: '[id="ThePage:siTable:12:locations:{N}:_idJsp194"]',
    county: '[id="ThePage:siTable:12:locations:{N}:_idJsp196"]',
    state: '[id="ThePage:siTable:12:locations:{N}:_idJsp198"]',
    zip: '[id="ThePage:siTable:12:locations:{N}:_idJsp200"]',
    parcel: '[id="ThePage:siTable:12:locations:{N}:_idJsp202"]',
    latitude: '[id="ThePage:siTable:12:locations:{N}:_idJsp204"]',
    longitude: '[id="ThePage:siTable:12:locations:{N}:_idJsp206"]',
  },
  accessPointsTable: '[id="ThePage:siTable:12:accessPoints"]',
  accessPointRow: {
    latitude: '[id="ThePage:siTable:12:accessPoints:{N}:_idJsp227"]',
    longitude: '[id="ThePage:siTable:12:accessPoints:{N}:_idJsp229"]',
  },
} as const;

/** Location row data from the locations table */
export interface LocationData {
  address: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  parcel: string;
  latitude: string;
  longitude: string;
}

/** Access point data from the access points table */
export interface AccessPointData {
  latitude: string;
  longitude: string;
}

/** Full Page 2 state */
export interface Page2State {
  /** Disturbed area acreage from site drawing */
  disturbedAcreage: string;
  /** Whether disturbed acreage has a value */
  hasDisturbedAcreage: boolean;
  /** Number of locations in the table */
  locationCount: number;
  /** First location data (if exists) */
  firstLocation: LocationData | null;
  /** Number of access points */
  accessPointCount: number;
  /** First access point data (if exists) */
  firstAccessPoint: AccessPointData | null;
  /** Whether Edit Site Drawing button is visible (indicates map data exists) */
  hasMapData: boolean;
  /** Whether Add Site Drawing button is visible (indicates no map data) */
  needsMapData: boolean;
  /** Whether the "Project site drawing not found" error message is visible */
  hasNoDrawingError: boolean;
}

/**
 * Get the current state of Page 2 fields.
 *
 * @param page - Playwright Page instance
 * @returns Page2State object with actual field values
 */
export async function getPage2State(page: Page): Promise<Page2State> {
  return await page.evaluate(
    (args) => {
      const { siteSelectors, page2 } = args;

      const getText = (sel: string): string => {
        const el = document.querySelector(sel);
        return el?.textContent?.trim() || "";
      };

      const isVisible = (sel: string): boolean => {
        const el = document.querySelector(sel);
        if (!el) {
          return false;
        }
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
      };

      // Get disturbed acreage
      const disturbedAcreage = getText(siteSelectors.disturbedArea);

      // Count locations in table
      const locationsTable = document.querySelector(
        siteSelectors.locationsTable
      );
      const locationRows = locationsTable?.querySelectorAll("tr") || [];
      // Subtract 1 for header row
      const locationCount = Math.max(0, locationRows.length - 1);

      // Get first location data
      let firstLocation: LocationData | null = null;
      if (locationCount > 0) {
        const getLocField = (field: string): string => {
          const sel = siteSelectors.locationRow[
            field as keyof typeof siteSelectors.locationRow
          ] as string;
          return getText(sel.replace("{N}", "0"));
        };

        firstLocation = {
          address: getLocField("address"),
          city: getLocField("city"),
          county: getLocField("county"),
          state: getLocField("state"),
          zip: getLocField("zip"),
          parcel: getLocField("parcel"),
          latitude: getLocField("latitude"),
          longitude: getLocField("longitude"),
        };
      }

      // Count access points
      const accessPointsTable = document.querySelector(
        siteSelectors.accessPointsTable
      );
      const accessPointRows = accessPointsTable?.querySelectorAll("tr") || [];
      const accessPointCount = Math.max(0, accessPointRows.length - 1);

      // Get first access point
      let firstAccessPoint: AccessPointData | null = null;
      if (accessPointCount > 0) {
        const getAPField = (field: string): string => {
          const sel = siteSelectors.accessPointRow[
            field as keyof typeof siteSelectors.accessPointRow
          ] as string;
          return getText(sel.replace("{N}", "0"));
        };

        firstAccessPoint = {
          latitude: getAPField("latitude"),
          longitude: getAPField("longitude"),
        };
      }

      // Check map button states
      const hasMapData = isVisible(page2.editSiteDrawingBtn);
      const needsMapData = isVisible(page2.addSiteDrawingBtn);

      // Check for "Project site drawing not found" error message
      const hasNoDrawingError =
        document.body?.innerText?.includes("Project site drawing not found") ??
        false;

      return {
        disturbedAcreage,
        hasDisturbedAcreage: disturbedAcreage.length > 0,
        locationCount,
        firstLocation,
        accessPointCount,
        firstAccessPoint,
        hasMapData,
        needsMapData,
        hasNoDrawingError,
      };
    },
    { siteSelectors: page2Selectors, page2: portal.page2 }
  );
}

/**
 * Verify Page 2 has required data for a renewal.
 *
 * A valid renewal should have:
 * - Disturbed acreage > 0
 * - At least 1 location with address
 * - Map data (Edit button visible, not Add button)
 *
 * @param state - Page2State from getPage2State()
 * @returns Object with isValid flag and list of missing items
 */
export function verifyPage2ForRenewal(state: Page2State): {
  isValid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!state.hasDisturbedAcreage) {
    missing.push("Disturbed acreage is empty");
  }

  if (state.locationCount === 0) {
    missing.push("No locations in table");
  }

  if (state.firstLocation && !state.firstLocation.address) {
    missing.push("First location has no address");
  }

  if (!state.hasMapData && state.needsMapData) {
    missing.push("No map data (Add Site Drawing button visible)");
  }

  return {
    isValid: missing.length === 0,
    missing,
  };
}

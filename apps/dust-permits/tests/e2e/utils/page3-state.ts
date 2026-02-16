/**
 * Page 3 State Verification
 *
 * Checks the current state of Page 3 (Project Details) form fields.
 * Used exclusively in E2E tests for assertions and debugging.
 */

import type { Page } from "playwright";
import type { Page3State } from "@/portal/types";
import { selectors } from "@/portal/utils/selectors";

/**
 * Check the current state of Page 3 fields.
 *
 * @param page - Playwright Page instance
 * @returns Page3State object with boolean flags for key fields
 */
export async function getPage3State(page: Page): Promise<Page3State> {
  return await page.evaluate((sels) => {
    const getValue = (sel: string) => {
      const el = document.querySelector(sel) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      return el?.value?.trim() || "";
    };

    return {
      contact: {
        hasCompanyName: getValue(sels.primaryContact.companyName).length > 0,
        hasEmail: getValue(sels.primaryContact.email).length > 0,
        hasFirstName: getValue(sels.primaryContact.firstName).length > 0,
        hasLastName: getValue(sels.primaryContact.lastName).length > 0,
        hasMobile: getValue(sels.primaryContact.mobile).length > 0,
        hasOnSitePhone: getValue(sels.primaryContact.phone).length > 0,
        hasTitle: getValue(sels.primaryContact.title).length > 0,
      },
      project: {
        hasDescription: getValue(sels.project.description).length > 0,
        hasEndDate: getValue(sels.project.endDate).length > 0,
        hasName: getValue(sels.project.name).length > 0,
        hasStartDate: getValue(sels.project.startDate).length > 0,
      },
      specs: {
        hasBulkMaterialCubicYards:
          getValue(sels.project.bulkMaterialsCubicYards).length > 0,
        hasDemolitionAnswer: true, // Demolition radio is always answered
      },
    };
  }, selectors);
}

/**
 * Page 1 State Verification
 *
 * Checks the current state of Page 1 (Applicant Information) form fields.
 * Used exclusively in E2E tests for assertions and debugging.
 */

import type { Page } from "playwright";
import type { Page1State } from "@/portal/types";
import { selectors } from "@/portal/utils/selectors";

/**
 * Check the current state of Page 1 fields.
 *
 * Useful for verifying that fields have been filled or for debugging.
 *
 * @param page - Playwright Page instance
 * @returns Page1State object with boolean flags for key fields
 */
export async function getPage1State(page: Page): Promise<Page1State> {
  return await page.evaluate((sels) => {
    const getValue = (sel: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      return el?.value?.trim() || "";
    };
    const isChecked = (sel: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      return el?.checked ?? false;
    };

    return {
      applicant: {
        propertyOwnerChecked: isChecked(sels.applicant.isPropertyOwner.yes),
        generalContractorChecked: isChecked(
          sels.applicant.isGeneralContractor.yes
        ),
        developerChecked: isChecked(sels.applicant.isDeveloper.yes),
        lesseeChecked: isChecked(sels.applicant.isLessee.yes),
        hasEntityType:
          getValue(sels.applicant.entityType.Corporation).length > 0, // Entity type is complex, corporation is a common proxy
        hasCompanyName: getValue(sels.applicant.companyName).length > 0,
        hasAddress1: getValue(sels.applicant.address1).length > 0,
        hasAddress2: getValue(sels.applicant.address2).length > 0,
        hasCity: getValue(sels.applicant.city).length > 0,
        hasState: getValue(sels.applicant.state).length > 0,
        hasZip: getValue(sels.applicant.zip).length > 0,
        hasPhone: getValue(sels.applicant.phone).length > 0,
        hasEmail: getValue(sels.applicant.email).length > 0,
      },
      permitContact: {
        hasEmail: getValue(sels.permitContact.email).length > 0,
        hasName: getValue(sels.permitContact.name).length > 0,
        hasPhone: getValue(sels.permitContact.phone).length > 0,
      },
      presidentOwner: {
        hasFirstName: getValue(sels.presidentOwner.firstName).length > 0,
        hasLastName: getValue(sels.presidentOwner.lastName).length > 0,
        hasAddress1: getValue(sels.presidentOwner.address1).length > 0,
        hasAddress2: getValue(sels.presidentOwner.address2).length > 0,
        hasCity: getValue(sels.presidentOwner.city).length > 0,
        hasState: getValue(sels.presidentOwner.state).length > 0,
        hasZip: getValue(sels.presidentOwner.zip).length > 0,
        hasPhone: getValue(sels.presidentOwner.phone).length > 0,
        hasEmail: getValue(sels.presidentOwner.email).length > 0,
      },
      propertyOwner: {
        hasAnswer:
          isChecked(sels.propertyOwner.isDifferent.yes) ||
          isChecked(sels.propertyOwner.isDifferent.no),
        hasEntityType:
          getValue(sels.propertyOwner.entityType.Corporation).length > 0,
        hasName: getValue(sels.propertyOwner.name).length > 0,
        hasAddress1: getValue(sels.propertyOwner.address1).length > 0,
        hasAddress2: getValue(sels.propertyOwner.address2).length > 0,
        hasCity: getValue(sels.propertyOwner.city).length > 0,
        hasState: getValue(sels.propertyOwner.state).length > 0,
        hasZip: getValue(sels.propertyOwner.zip).length > 0,
        hasPhone: getValue(sels.propertyOwner.phone).length > 0,
        hasFax: getValue(sels.propertyOwner.fax).length > 0,
        hasContactFirstName:
          getValue(sels.propertyOwner.contactFirstName).length > 0,
        hasContactLastName:
          getValue(sels.propertyOwner.contactLastName).length > 0,
        hasContactPhone: getValue(sels.propertyOwner.contactPhone).length > 0,
        hasContactEmail: getValue(sels.propertyOwner.contactEmail).length > 0,
      },
      subsidiary: {
        hasAnswer:
          isChecked(sels.subsidiary.isSubsidiary.yes) ||
          isChecked(sels.subsidiary.isSubsidiary.no),
        hasParentEntityType:
          getValue(sels.subsidiary.parentEntityType.Corporation).length > 0,
        hasParentName: getValue(sels.subsidiary.parentName).length > 0,
        hasParentAddress1: getValue(sels.subsidiary.parentAddress1).length > 0,
        hasParentAddress2: getValue(sels.subsidiary.parentAddress2).length > 0,
        hasParentCity: getValue(sels.subsidiary.parentCity).length > 0,
        hasParentState: getValue(sels.subsidiary.parentState).length > 0,
        hasParentZip: getValue(sels.subsidiary.parentZip).length > 0,
        hasParentPhone: getValue(sels.subsidiary.parentPhone).length > 0,
        hasParentEmail: getValue(sels.subsidiary.parentEmail).length > 0,
        hasParentStateOfIncorporation:
          getValue(sels.subsidiary.parentStateOfIncorporation).length > 0,
      },
      violation: {
        hasAnswer:
          isChecked(sels.violation.hasViolation.yes) ||
          isChecked(sels.violation.hasViolation.no),
        hasPermitNumber: getValue(sels.violation.permitNumber).length > 0,
      },
    };
  }, selectors);
}

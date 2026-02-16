/**
 * Fill Page 1 - Applicant Information
 *
 * Fills contact information, violation details, applicant company info,
 * president/owner details, subsidiary information, and property owner details.
 *
 * Accepts partial data - only fills fields that are provided.
 * Note: Checks for !== undefined, not truthiness, so empty strings are filled.
 */

import type { Page } from "playwright";
import type { DeepPartial, FormData } from "@/form-data";
import {
  clickRadio,
  fillText,
  SETTLE_MS,
  selectByLabel,
  setCheckbox,
  sleep,
} from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Page 1 - Applicant Information.
 *
 * @param page - Playwright Page instance
 * @param data - FormData (full or partial) containing applicant, contact, and property owner info
 * @param mode - "full" fills all fields, "partial" only fills required fields
 * @returns True if page was filled successfully
 */
export async function fillPage1(
  page: Page,
  data: FormData | DeepPartial<FormData>,
  mode: "full" | "partial" = "partial"
): Promise<boolean> {
  console.log(`\n[FILL PAGE 1 - ${mode.toUpperCase()} MODE]`);
  try {
    // Section A.1: Contact info (email where permit is sent)
    // Only fill if permitContact section exists
    if (data.permitContact?.email !== undefined) {
      await fillText(
        page,
        selectors.permitContact.email,
        data.permitContact.email
      );
    }
    if (data.permitContact?.name !== undefined) {
      await fillText(
        page,
        selectors.permitContact.name,
        data.permitContact.name
      );
    }
    if (data.permitContact?.phone !== undefined) {
      await fillText(
        page,
        selectors.permitContact.phone,
        data.permitContact.phone
      );
    }

    // Section A.2: Violation question
    // Only handle if violation section exists
    if (data.violation !== undefined) {
      if (data.violation.hasViolation) {
        await clickRadio(page, selectors.violation.hasViolation.yes);
        await sleep(SETTLE_MS); // Allow permit number field to appear
        if (data.violation.permitNumber !== undefined) {
          await fillText(
            page,
            selectors.violation.permitNumber,
            data.violation.permitNumber
          );
        }
      } else if (data.violation.hasViolation === false) {
        await clickRadio(page, selectors.violation.hasViolation.no);
      }
    }

    if (mode === "full") {
      // Section A.4: Applicant relationship to property
      if (data.applicant?.isPropertyOwner) {
        await setCheckbox(page, selectors.applicant.isPropertyOwner.yes, true);
      }
      if (data.applicant?.isGeneralContractor) {
        await setCheckbox(
          page,
          selectors.applicant.isGeneralContractor.yes,
          true
        );
      }
      if (data.applicant?.isDeveloper) {
        await setCheckbox(page, selectors.applicant.isDeveloper.yes, true);
      }
      if (data.applicant?.isLessee) {
        await setCheckbox(page, selectors.applicant.isLessee.yes, true);
      }

      // Section A.5: Applicant company details
      if (data.applicant?.entityType !== undefined) {
        await selectByLabel(
          page,
          selectors.applicant.entityType[data.applicant.entityType],
          data.applicant.entityType
        );
      }
      if (data.applicant?.companyName !== undefined) {
        await fillText(
          page,
          selectors.applicant.companyName,
          data.applicant.companyName
        );
      }
      if (data.applicant?.address1 !== undefined) {
        await fillText(
          page,
          selectors.applicant.address1,
          data.applicant.address1
        );
      }
      if (data.applicant?.address2 !== undefined) {
        await fillText(
          page,
          selectors.applicant.address2,
          data.applicant.address2
        );
      }
      if (data.applicant?.city !== undefined) {
        await fillText(page, selectors.applicant.city, data.applicant.city);
      }
      if (data.applicant?.state !== undefined) {
        await selectByLabel(
          page,
          selectors.applicant.state,
          data.applicant.state
        );
      }
      if (data.applicant?.zip !== undefined) {
        await fillText(page, selectors.applicant.zip, data.applicant.zip);
      }
      if (data.applicant?.phone !== undefined) {
        await fillText(page, selectors.applicant.phone, data.applicant.phone);
      }
      if (data.applicant?.email !== undefined) {
        await fillText(page, selectors.applicant.email, data.applicant.email);
      }

      // Section A.5: President/Owner details
      if (data.presidentOwner?.firstName !== undefined) {
        await fillText(
          page,
          selectors.presidentOwner.firstName,
          data.presidentOwner.firstName
        );
      }
      if (data.presidentOwner?.lastName !== undefined) {
        await fillText(
          page,
          selectors.presidentOwner.lastName,
          data.presidentOwner.lastName
        );
      }
      if (data.presidentOwner?.address1 !== undefined) {
        await fillText(
          page,
          selectors.presidentOwner.address1,
          data.presidentOwner.address1
        );
      }
      if (data.presidentOwner?.address2 !== undefined) {
        await fillText(
          page,
          selectors.presidentOwner.address2,
          data.presidentOwner.address2
        );
      }
      if (data.presidentOwner?.city !== undefined) {
        await fillText(
          page,
          selectors.presidentOwner.city,
          data.presidentOwner.city
        );
      }
      if (data.presidentOwner?.state !== undefined) {
        await selectByLabel(
          page,
          selectors.presidentOwner.state,
          data.presidentOwner.state
        );
      }
      if (data.presidentOwner?.zip !== undefined) {
        await fillText(
          page,
          selectors.presidentOwner.zip,
          data.presidentOwner.zip
        );
      }
      if (data.presidentOwner?.phone !== undefined) {
        await fillText(
          page,
          selectors.presidentOwner.phone,
          data.presidentOwner.phone
        );
      }
      if (data.presidentOwner?.email !== undefined) {
        await fillText(
          page,
          selectors.presidentOwner.email,
          data.presidentOwner.email
        );
      }

      // Section A.3: Subsidiary question
      if (data.subsidiary !== undefined) {
        if (data.subsidiary.isSubsidiary) {
          await clickRadio(page, selectors.subsidiary.isSubsidiary.yes);
          const { parentEntityType } = data.subsidiary;
          const { parentName } = data.subsidiary;
          if (parentName !== undefined && parentEntityType !== undefined) {
            await selectByLabel(
              page,
              selectors.subsidiary.parentEntityType[parentEntityType],
              parentEntityType
            );
            await fillText(page, selectors.subsidiary.parentName, parentName);
            if (data.subsidiary.parentAddress1 !== undefined) {
              await fillText(
                page,
                selectors.subsidiary.parentAddress1,
                data.subsidiary.parentAddress1
              );
            }
            if (data.subsidiary.parentAddress2 !== undefined) {
              await fillText(
                page,
                selectors.subsidiary.parentAddress2,
                data.subsidiary.parentAddress2
              );
            }
            if (data.subsidiary.parentCity !== undefined) {
              await fillText(
                page,
                selectors.subsidiary.parentCity,
                data.subsidiary.parentCity
              );
            }
            if (data.subsidiary.parentState !== undefined) {
              await selectByLabel(
                page,
                selectors.subsidiary.parentState,
                data.subsidiary.parentState
              );
            }
            if (data.subsidiary.parentZip !== undefined) {
              await fillText(
                page,
                selectors.subsidiary.parentZip,
                data.subsidiary.parentZip
              );
            }
            if (data.subsidiary.parentPhone !== undefined) {
              await fillText(
                page,
                selectors.subsidiary.parentPhone,
                data.subsidiary.parentPhone
              );
            }
            if (data.subsidiary.parentEmail !== undefined) {
              await fillText(
                page,
                selectors.subsidiary.parentEmail,
                data.subsidiary.parentEmail
              );
            }
            if (data.subsidiary.parentStateOfIncorporation !== undefined) {
              await selectByLabel(
                page,
                selectors.subsidiary.parentStateOfIncorporation,
                data.subsidiary.parentStateOfIncorporation
              );
            }
          }
        } else if (data.subsidiary.isSubsidiary === false) {
          await clickRadio(page, selectors.subsidiary.isSubsidiary.no);
        }
      }
    }

    // In partial mode, fill applicant address ONLY if actual non-empty value provided
    // (For revisions with real overrides, not creates with empty string defaults)
    // Note: Existing company creates have read-only address spans, not editable inputs
    if (mode === "partial" && data.applicant) {
      if (data.applicant.address1) {
        await fillText(
          page,
          selectors.applicant.address1,
          data.applicant.address1
        );
      }
      if (data.applicant.address2) {
        await fillText(
          page,
          selectors.applicant.address2,
          data.applicant.address2
        );
      }
      if (data.applicant.city) {
        await fillText(page, selectors.applicant.city, data.applicant.city);
      }
      if (data.applicant.state) {
        await selectByLabel(
          page,
          selectors.applicant.state,
          data.applicant.state
        );
      }
      if (data.applicant.zip) {
        await fillText(page, selectors.applicant.zip, data.applicant.zip);
      }
    }

    // Section A.4: Property Owner question
    // Only handle if propertyOwner section exists
    if (data.propertyOwner !== undefined) {
      if (data.propertyOwner.isDifferent) {
        await clickRadio(page, selectors.propertyOwner.isDifferent.yes);
        const { entityType } = data.propertyOwner;
        const propertyOwnerName = data.propertyOwner.name;
        if (propertyOwnerName !== undefined && entityType !== undefined) {
          await selectByLabel(
            page,
            selectors.propertyOwner.entityType[entityType],
            entityType
          );
          await fillText(page, selectors.propertyOwner.name, propertyOwnerName);
          if (data.propertyOwner.address1 !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.address1,
              data.propertyOwner.address1
            );
          }
          if (data.propertyOwner.address2 !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.address2,
              data.propertyOwner.address2
            );
          }
          if (data.propertyOwner.city !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.city,
              data.propertyOwner.city
            );
          }
          if (data.propertyOwner.state !== undefined) {
            await selectByLabel(
              page,
              selectors.propertyOwner.state,
              data.propertyOwner.state
            );
          }
          if (data.propertyOwner.zip !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.zip,
              data.propertyOwner.zip
            );
          }
          if (data.propertyOwner.phone !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.phone,
              data.propertyOwner.phone
            );
          }
          if (data.propertyOwner.fax !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.fax,
              data.propertyOwner.fax
            );
          }
          if (data.propertyOwner.contactFirstName !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.contactFirstName,
              data.propertyOwner.contactFirstName
            );
          }
          if (data.propertyOwner.contactLastName !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.contactLastName,
              data.propertyOwner.contactLastName
            );
          }
          if (data.propertyOwner.contactPhone !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.contactPhone,
              data.propertyOwner.contactPhone
            );
          }
          if (data.propertyOwner.contactEmail !== undefined) {
            await fillText(
              page,
              selectors.propertyOwner.contactEmail,
              data.propertyOwner.contactEmail
            );
          }
        }
      } else if (data.propertyOwner.isDifferent === false) {
        await clickRadio(page, selectors.propertyOwner.isDifferent.no);
      }
    }

    console.log("  Page 1 fill completed");
    return true;
  } catch (error) {
    console.log(`  fillPage1 failed: ${error}`);
    return false;
  }
}

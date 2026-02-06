/**
 * Fill Page 3 - Project Details
 *
 * Fills the primary contact, project info, and project specifications.
 * Does NOT click Next - caller controls navigation after verifying state.
 *
 * Accepts partial data - only fills fields that are provided.
 * Note: Checks for !== undefined, not truthiness, so empty strings are filled.
 */

import type { Page } from "playwright";
import type { DeepPartial, FormData } from "@/form-data";
import { clickRadio, fillText } from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Page 3 - Project Details.
 *
 * @param page - Playwright Page instance
 * @param data - FormData (full or partial) containing primaryContact and project info
 * @returns True if page was filled successfully
 */
export async function fillPage3(
  page: Page,
  data: FormData | DeepPartial<FormData>
): Promise<boolean> {
  console.log("\n[FILL PAGE 3]");
  try {
    // Primary Project Contact - only fill if fields are provided
    const pc = selectors.primaryContact;

    if (data.primaryContact?.firstName !== undefined) {
      await fillText(page, pc.firstName, data.primaryContact.firstName);
    }
    if (data.primaryContact?.lastName !== undefined) {
      await fillText(page, pc.lastName, data.primaryContact.lastName);
    }
    if (data.primaryContact?.title !== undefined) {
      await fillText(page, pc.title, data.primaryContact.title);
    }
    if (data.primaryContact?.email !== undefined) {
      await fillText(page, pc.email, data.primaryContact.email);
    }

    // Company name: use primaryContact.companyName if provided, fallback to applicant.companyName
    const contactCompanyName =
      data.primaryContact?.companyName ?? data.applicant?.companyName;
    if (contactCompanyName !== undefined) {
      await fillText(page, pc.companyName, contactCompanyName);
    }

    if (data.primaryContact?.phone !== undefined) {
      await fillText(page, pc.phone, data.primaryContact.phone);
    }

    // Mobile: use mobile if provided, fallback to phone
    const contactMobile =
      data.primaryContact?.mobile ?? data.primaryContact?.phone;
    if (contactMobile !== undefined) {
      await fillText(page, pc.mobile, contactMobile);
    }

    if (data.primaryContact?.fax !== undefined) {
      await fillText(page, pc.fax, data.primaryContact.fax);
    }

    // Project Info - only fill if fields are provided
    const pj = selectors.project;

    if (data.project?.name !== undefined) {
      await fillText(page, pj.name, data.project.name);
    }
    if (data.project?.description !== undefined) {
      await fillText(page, pj.description, data.project.description);
    }
    if (data.project?.startDate !== undefined) {
      await fillText(page, pj.startDate, data.project.startDate);
    }
    if (data.project?.endDate !== undefined) {
      await fillText(page, pj.endDate, data.project.endDate);
    }

    // Project Specs - Bulk material cubic yards
    if (data.project?.bulkMaterialsCubicYards !== undefined) {
      await fillText(
        page,
        pj.bulkMaterialsCubicYards,
        data.project.bulkMaterialsCubicYards.toString()
      );
    }

    // Demolition question - only handle if explicitly set
    if (data.project?.hasDemolition !== undefined) {
      if (data.project.hasDemolition) {
        await clickRadio(page, pj.hasDemolition.yes);
      } else {
        await clickRadio(page, pj.hasDemolition.no);
      }
    }

    console.log("  Page 3 fill completed");
    return true;
  } catch (e) {
    console.log(`  fillPage3 failed: ${e}`);
    return false;
  }
}

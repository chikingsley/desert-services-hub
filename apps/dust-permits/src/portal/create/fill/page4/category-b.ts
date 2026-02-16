/**
 * Fill Category B - Unpaved Areas
 *
 * B.1: Unpaved Staging Areas (Has Yes/No)
 * B.2: Unpaved Access Roads (Has Yes/No)
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import {
  clickRadio,
  fillText,
  fillTextSafe,
  SETTLE_MS,
  selectControlMeasure,
  sleep,
} from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Category B.1 - Unpaved Staging Areas.
 */
async function fillCategoryB1(page: Page, data: FormData): Promise<void> {
  console.log("  Category B.1 - Unpaved Staging Areas...");

  if (data.categoryB1.applies) {
    await clickRadio(page, selectors.categoryB1.applies.yes);

    const b1 = selectors.categoryB1;
    await selectControlMeasure(page, data.categoryB1.pave, b1.pave);
    await selectControlMeasure(page, data.categoryB1.gravel, b1.gravel);
    await selectControlMeasure(page, data.categoryB1.water, b1.water);
    await selectControlMeasure(
      page,
      data.categoryB1.dustSuppressants,
      b1.dustSuppressants
    );
    await selectControlMeasure(page, data.categoryB1.limitTrips, b1.limitTrips);
    await selectControlMeasure(page, data.categoryB1.other, b1.other);

    // ======================================================================
    // CONDITIONAL FIELDS - appear based on control measure selections
    // Extra settle to allow conditional fields to render after radio clicks
    // ======================================================================
    await sleep(SETTLE_MS);

    // Pave timing (appears if pave is selected)
    if (data.categoryB1.pave !== "None") {
      if (data.categoryB1.paveWhen === "prior") {
        await clickRadio(page, b1.paveWhen.prior);
      } else if (data.categoryB1.paveWhen === "during") {
        await clickRadio(page, b1.paveWhen.during);
      } else if (data.categoryB1.paveWhen === "end") {
        await clickRadio(page, b1.paveWhen.end);
      }
    }

    // Dust Suppressants details (use safe fill with label fallback for dynamic indices)
    if (data.categoryB1.dustSuppressants !== "None") {
      if (data.categoryB1.dustSuppressantsFrequency) {
        await fillTextSafe(
          page,
          b1.dustSuppressantsFrequency,
          data.categoryB1.dustSuppressantsFrequency,
          { labelFallback: "Frequency of application (Dust suppressants)" }
        );
      }
      if (data.categoryB1.dustSuppressantsAmount) {
        await fillTextSafe(
          page,
          b1.dustSuppressantsAmount,
          data.categoryB1.dustSuppressantsAmount,
          { labelFallback: "Amount (Dust suppressants)" }
        );
      }
    }

    // Limit Trips details (use safe fill with label fallback for dynamic indices)
    if (data.categoryB1.limitTrips !== "None") {
      if (data.categoryB1.limitTripsMax) {
        await fillTextSafe(
          page,
          b1.limitTripsMax,
          data.categoryB1.limitTripsMax,
          {
            labelFallback: "Maximum number of vehicle trips",
          }
        );
      }
      if (data.categoryB1.speedRestrictionMethod) {
        await fillTextSafe(
          page,
          b1.speedRestrictionMethod,
          data.categoryB1.speedRestrictionMethod,
          { labelFallback: "Provide a description of how vehicle speeds" }
        );
      }
    }

    // Other description
    if (data.categoryB1.other !== "None" && data.categoryB1.otherDescription) {
      await fillTextSafe(
        page,
        b1.otherDescription,
        data.categoryB1.otherDescription,
        {
          labelFallback: "Other:",
        }
      );
    }
  } else {
    await clickRadio(page, selectors.categoryB1.applies.no);
  }
}

/**
 * Fill Category B.2 - Unpaved Access Roads.
 */
async function fillCategoryB2(page: Page, data: FormData): Promise<void> {
  console.log("  Category B.2 - Unpaved Access Roads...");

  if (data.categoryB2.applies) {
    await clickRadio(page, selectors.categoryB2.applies.yes);

    const b2 = selectors.categoryB2;
    await selectControlMeasure(page, data.categoryB2.pave, b2.pave);
    await selectControlMeasure(page, data.categoryB2.gravel, b2.gravel);
    await selectControlMeasure(page, data.categoryB2.water, b2.water);
    await selectControlMeasure(
      page,
      data.categoryB2.dustSuppressants,
      b2.dustSuppressants
    );
    await selectControlMeasure(page, data.categoryB2.limitTrips, b2.limitTrips);
    await selectControlMeasure(
      page,
      data.categoryB2.ceaseOperations,
      b2.ceaseOperations
    );
    await selectControlMeasure(page, data.categoryB2.other, b2.other);

    // ======================================================================
    // CONDITIONAL FIELDS - appear based on control measure selections
    // Extra settle to allow conditional fields to render after radio clicks
    // ======================================================================
    await sleep(SETTLE_MS);

    // Pave timing (appears if pave is selected)
    if (data.categoryB2.pave !== "None") {
      if (data.categoryB2.paveWhen === "prior") {
        await clickRadio(page, b2.paveWhen.prior);
      } else if (data.categoryB2.paveWhen === "during") {
        await clickRadio(page, b2.paveWhen.during);
      } else if (data.categoryB2.paveWhen === "end") {
        await clickRadio(page, b2.paveWhen.end);
      }
    }

    // Dust Suppressants details (appears if dustSuppressants is selected)
    if (data.categoryB2.dustSuppressants !== "None") {
      if (data.categoryB2.dustSuppressantsFrequency) {
        await fillText(
          page,
          b2.dustSuppressantsFrequency,
          data.categoryB2.dustSuppressantsFrequency
        );
      }
      if (data.categoryB2.dustSuppressantsAmount) {
        await fillText(
          page,
          b2.dustSuppressantsAmount,
          data.categoryB2.dustSuppressantsAmount
        );
      }
    }

    // Limit Trips details (appears if limitTrips is selected)
    if (data.categoryB2.limitTrips !== "None") {
      if (data.categoryB2.limitTripsMax) {
        await fillText(page, b2.limitTripsMax, data.categoryB2.limitTripsMax);
      }
      if (data.categoryB2.speedRestrictionMethod) {
        await fillText(
          page,
          b2.speedRestrictionMethod,
          data.categoryB2.speedRestrictionMethod
        );
      }
    }

    // Cease operations area specification (appears if cease operations is Contingency)
    if (
      data.categoryB2.ceaseOperations === "Contingency" &&
      data.categoryB2.ceaseOperationsAreaSpecification
    ) {
      await fillTextSafe(
        page,
        b2.ceaseOperationsAreaSpecification,
        data.categoryB2.ceaseOperationsAreaSpecification,
        { labelFallback: "Specify which area(s) this will apply to:" }
      );
    }

    // Other description (appears if other is selected)
    if (data.categoryB2.other !== "None" && data.categoryB2.otherDescription) {
      await fillText(
        page,
        b2.otherDescription,
        data.categoryB2.otherDescription
      );
    }
  } else {
    await clickRadio(page, selectors.categoryB2.applies.no);
  }
}

/**
 * Fill Category B - Unpaved Areas (B1 + B2).
 */
export async function fillCategoryB(page: Page, data: FormData): Promise<void> {
  await fillCategoryB1(page, data);
  await fillCategoryB2(page, data);
}

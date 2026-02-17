/**
 * Vaadin Web Component Interaction Helpers
 *
 * Point & Pay uses Vaadin components which behave differently from Oracle ADF:
 * - <vaadin-text-field> wraps a native <input slot="input">
 * - <vaadin-combo-box> needs type-to-filter + click overlay item (no selectOption)
 * - <vaadin-checkbox> wraps a native <input type="checkbox">
 * - <vaadin-button> responds to standard click()
 *
 * These helpers abstract those differences.
 */

import type { Page } from "playwright";
import { SETTLE_MS, sleep } from "@/portal/utils/helpers";

/** Shorter settle for Vaadin (faster than ADF partial submits) */
const VAADIN_SETTLE_MS = 500;

/**
 * Fill a Vaadin text field.
 *
 * If the selector targets the inner input directly (input[slot="input"]),
 * uses standard fill(). If it targets the web component, finds the inner input first.
 */
export async function fillVaadinText(
  page: Page,
  selector: string,
  value: string,
  fieldName?: string
): Promise<boolean> {
  try {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout: 10_000 });
    await locator.fill(value);
    await sleep(VAADIN_SETTLE_MS);
    if (fieldName) {
      console.log(`    ✓ ${fieldName}`);
    }
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`    ✗ ${fieldName ?? selector}: ${msg}`);
    return false;
  }
}

/**
 * Select a value from a Vaadin combo-box.
 *
 * Vaadin combo-boxes don't support selectOption(). Instead:
 * 1. Click to open the dropdown
 * 2. Clear existing value
 * 3. Type the desired value to filter
 * 4. Click the matching overlay item
 *
 * @param comboSelector - Selector for the <vaadin-combo-box> element itself (not the inner input)
 */
export async function selectVaadinCombo(
  page: Page,
  comboSelector: string,
  value: string,
  fieldName?: string
): Promise<boolean> {
  try {
    const combo = page.locator(comboSelector).first();
    await combo.waitFor({ state: "visible", timeout: 10_000 });

    // Find the inner input within the combo-box
    const input = combo.locator('input[slot="input"]').first();
    await input.click();
    await sleep(300);

    // Clear and type to filter
    await input.fill("");
    await input.fill(value);
    await sleep(500);

    // Click the matching item in the overlay dropdown
    // Vaadin renders overlay items in a separate DOM element
    const overlayItem = page
      .locator(`vaadin-combo-box-item:has-text("${value}")`)
      .first();

    const itemVisible = await overlayItem
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (itemVisible) {
      await overlayItem.click();
    } else {
      // Fallback: press Enter to accept the typed value
      await input.press("Enter");
    }

    await sleep(VAADIN_SETTLE_MS);
    if (fieldName) {
      console.log(`    ✓ ${fieldName}: ${value}`);
    }
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`    ✗ ${fieldName ?? comboSelector}: ${msg}`);
    return false;
  }
}

/**
 * Click a Vaadin button.
 */
export async function clickVaadinButton(
  page: Page,
  selector: string,
  fieldName?: string
): Promise<boolean> {
  try {
    const button = page.locator(selector).first();
    await button.waitFor({ state: "visible", timeout: 10_000 });
    await button.click();
    await sleep(SETTLE_MS);
    if (fieldName) {
      console.log(`    ✓ Clicked: ${fieldName}`);
    }
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`    ✗ Click ${fieldName ?? selector}: ${msg}`);
    return false;
  }
}

/**
 * Check/uncheck a Vaadin checkbox.
 */
export async function checkVaadinCheckbox(
  page: Page,
  selector: string,
  checked: boolean,
  fieldName?: string
): Promise<boolean> {
  try {
    const checkbox = page.locator(selector).first();
    await checkbox.waitFor({ state: "visible", timeout: 10_000 });

    const isCurrentlyChecked = await checkbox.isChecked();
    if (checked !== isCurrentlyChecked) {
      await checkbox.click();
    }

    await sleep(VAADIN_SETTLE_MS);
    if (fieldName) {
      console.log(`    ✓ ${fieldName}: ${checked ? "checked" : "unchecked"}`);
    }
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`    ✗ ${fieldName ?? selector}: ${msg}`);
    return false;
  }
}

/**
 * Read text content from a Vaadin element or its inner input value.
 */
export async function readVaadinText(
  page: Page,
  selector: string
): Promise<string | null> {
  try {
    const locator = page.locator(selector).first();
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      return null;
    }

    // Check if it's an input
    const tagName = await locator.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === "input" || tagName === "textarea") {
      return await locator.inputValue();
    }

    return await locator.textContent();
  } catch {
    return null;
  }
}

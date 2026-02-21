/**
 * Page 4 State Verification - Helper Functions
 *
 * Shared validation utilities for checking form field states in page.evaluate()
 */

/**
 * Returns helper functions for use within page.evaluate()
 * These functions operate in the browser context
 */
/** Check a radio input via :has-text() Playwright selector in browser context. */
function checkRadioByHasText(sel: string): boolean | null {
  if (!sel.includes(":has-text(")) {
    return null; // not a :has-text selector
  }
  const marker = ':has-text("';
  const markerIndex = sel.indexOf(marker);
  const textEnd = sel.indexOf('")', markerIndex + marker.length);
  if (markerIndex === -1 || textEnd === -1) {
    return null;
  }

  const textToFind = sel.slice(markerIndex + marker.length, textEnd);
  const baseSelector = sel.slice(0, markerIndex);
  if (!baseSelector) {
    return false;
  }

  for (const el of document.querySelectorAll(baseSelector)) {
    if (el.textContent?.includes(textToFind)) {
      const input = el.querySelector(
        'input[type="radio"]'
      ) as HTMLInputElement | null;
      if (input?.checked) {
        return true;
      }
    }
  }
  return false;
}

/** Resolve a ">> nth=" Playwright selector to a single element. */
function resolveNthSelector(selector: string): HTMLInputElement | null {
  const parts = selector.split(">> nth=");
  const baseSelector = parts[0]?.trim();
  if (!baseSelector) {
    return null;
  }

  let elements = [...document.querySelectorAll(baseSelector)];
  for (const part of parts.slice(1)) {
    const index = Number.parseInt(part.trim(), 10);
    const element = elements[index];
    if (element === undefined) {
      return null;
    }
    elements = [element];
  }
  return (elements[0] as HTMLInputElement) ?? null;
}

/** Normalize a selector input (string or string[]) into a non-empty array, or null if empty. */
function normalizeSelectors(sel: string | string[]): string[] | null {
  if (!sel) {
    return null;
  }
  const arr = Array.isArray(sel) ? sel : [sel];
  return arr.length > 0 ? arr : null;
}

/** Resolve a single selector to an HTMLInputElement, handling >> nth= syntax. */
function resolveInputElement(selector: string): HTMLInputElement | null {
  if (selector.includes(">> nth=")) {
    return resolveNthSelector(selector);
  }
  return document.querySelector(selector) as HTMLInputElement | null;
}

export function createValidationHelpers() {
  const isRadioChecked = (sel: string) => {
    if (!sel) {
      return false;
    }
    const hasTextResult = checkRadioByHasText(sel);
    if (hasTextResult !== null) {
      return hasTextResult;
    }
    try {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      return el?.checked === true;
    } catch {
      return false;
    }
  };

  const isCheckboxChecked = (sel: string | string[]) => {
    const selectors = normalizeSelectors(sel);
    if (!selectors) {
      return false;
    }
    for (const selector of selectors) {
      if (!selector) {
        continue;
      }
      const el = resolveInputElement(selector);
      if (el?.checked === true) {
        return true;
      }
    }
    return false;
  };

  const hasValue = (sel: string | string[]) => {
    const selectors = normalizeSelectors(sel);
    if (!selectors) {
      return false;
    }
    for (const selector of selectors) {
      if (!selector) {
        continue;
      }
      const el = document.querySelector(selector) as HTMLInputElement | null;
      if ((el?.value?.trim().length ?? 0) > 0) {
        return true;
      }
    }
    return false;
  };

  const hasAnyRadioChecked = (
    primary: string,
    contingency: string,
    none?: string
  ) =>
    isRadioChecked(primary) ||
    isRadioChecked(contingency) ||
    (none !== undefined && isRadioChecked(none));

  const isMeasureSelected = (primary: string, contingency: string) =>
    isRadioChecked(primary) || isRadioChecked(contingency);

  return {
    hasAnyRadioChecked,
    hasValue,
    isCheckboxChecked,
    isMeasureSelected,
    isRadioChecked,
  };
}

export type ValidationHelpers = ReturnType<typeof createValidationHelpers>;

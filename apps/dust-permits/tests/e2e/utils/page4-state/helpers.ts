/**
 * Page 4 State Verification - Helper Functions
 *
 * Shared validation utilities for checking form field states in page.evaluate()
 */

/**
 * Returns helper functions for use within page.evaluate()
 * These functions operate in the browser context
 */
export function createValidationHelpers() {
  const isRadioChecked = (sel: string) => {
    if (!sel) {
      return false;
    }
    // Handle Playwright selectors with :has-text() syntax
    if (sel.includes(":has-text(")) {
      const marker = ':has-text("';
      const markerIndex = sel.indexOf(marker);
      const textEnd = sel.indexOf('")', markerIndex + marker.length);
      if (markerIndex !== -1 && textEnd !== -1) {
        const textToFind = sel.slice(markerIndex + marker.length, textEnd);
        const baseSelector = sel.slice(0, markerIndex);
        if (!baseSelector) {
          return false;
        }

        // Find all matching elements and check if any contains the text
        const elements = [...document.querySelectorAll(baseSelector)];
        for (const el of elements) {
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
    }

    try {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      return el?.checked === true;
    } catch {
      // Invalid selector - return false
      return false;
    }
  };

  const isCheckboxChecked = (sel: string | string[]) => {
    if (!sel || (Array.isArray(sel) && sel.length === 0)) {
      return false;
    }
    // Support both single selector and array of fallback selectors
    const selectors = Array.isArray(sel) ? sel : [sel];

    for (const selector of selectors) {
      if (!selector) {
        continue;
      }
      // Handle Playwright selectors with >> nth syntax
      if (selector.includes(">> nth=")) {
        const parts = selector.split(">> nth=");
        const baseSelector = parts[0]?.trim();
        if (!baseSelector) {
          continue;
        }

        const indices = parts
          .slice(1)
          .map((p) => Number.parseInt(p.trim(), 10));

        let elements = [...document.querySelectorAll(baseSelector)];

        // Apply nth filters in order
        let found = true;
        for (const index of indices) {
          const element = elements[index];
          if (element !== undefined) {
            elements = [element];
          } else {
            found = false;
            break;
          }
        }

        if (found) {
          const el = elements[0] as HTMLInputElement | undefined;
          if (el?.checked === true) {
            return true;
          }
        }
        continue;
      }

      const el = document.querySelector(selector) as HTMLInputElement | null;
      if (el?.checked === true) {
        return true;
      }
    }
    return false;
  };

  const hasValue = (sel: string | string[]) => {
    if (!sel || (Array.isArray(sel) && sel.length === 0)) {
      return false;
    }
    // Support both single selector and array of fallback selectors
    const selectors = Array.isArray(sel) ? sel : [sel];
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

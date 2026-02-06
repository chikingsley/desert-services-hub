/**
 * Element Recording Utility
 *
 * Records available elements on the page for debugging purposes, similar to
 * Stagehand v3's observe pattern but focused on element discovery and state capture.
 *
 * Use this when selectors fail or when you need to understand what elements
 * are actually available on the page.
 *
 * @example
 * // Record all interactive elements
 * const elements = await recordPageElements(page);
 *
 * @example
 * // Record elements in a specific section (e.g., Category C4)
 * const elements = await recordPageElements(page, {
 *   filterBySelector: '[id*="siTable:27"]',
 *   outputPath: 'debug/category-c4-elements.json'
 * });
 *
 * @example
 * // Record and save automatically on failure
 * try {
 *   await fillPage4(page, data);
 * } catch (error) {
 *   await recordPageElements(page, {
 *     outputPath: `debug/failure-${Date.now()}.json`,
 *     includeScreenshot: true
 *   });
 *   throw error;
 * }
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Page } from "playwright";

export interface ElementRecord {
  /** Primary selector (ID if available, otherwise best available) */
  selector: string;
  /** Multiple selector types for resilience */
  selectors: {
    /** Element ID selector */
    id?: string;
    /** Name attribute selector */
    name?: string;
    /** Class selectors (array of individual classes) */
    classes?: string[];
    /** XPath selector */
    xpath?: string;
    /** Data attribute selectors */
    dataAttributes?: Record<string, string>;
    /** CSS selector (most specific available) */
    css?: string;
  };
  /** Element type */
  type:
    | "input"
    | "button"
    | "checkbox"
    | "radio"
    | "select"
    | "textarea"
    | "link"
    | "other";
  /** Current element state */
  state: {
    /** For checkboxes/radios */
    checked?: boolean;
    /** For inputs/selects/textareas */
    value?: string;
    /** Whether element is disabled */
    disabled?: boolean;
    /** Whether element is visible */
    visible?: boolean;
    /** Whether element is required */
    required?: boolean;
  };
  /** Associated label text */
  label?: string;
  /** Element attributes */
  attributes: {
    type?: string;
    name?: string;
    id?: string;
    class?: string;
    placeholder?: string;
    title?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
  };
  /** Element position (if visible) */
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Parent element context */
  context?: {
    /** Parent element ID */
    parentId?: string;
    /** Parent element classes */
    parentClasses?: string[];
    /** Text content of parent (for context) */
    parentText?: string;
  };
}

export interface RecordPageElementsOptions {
  /** Filter elements by selector pattern (e.g., '[id*="siTable:27"]') */
  filterBySelector?: string;
  /** Include non-interactive elements (default: false) */
  includeNonInteractive?: boolean;
  /** Output path for JSON file (relative to project root) */
  outputPath?: string;
  /** Include screenshot in output directory */
  includeScreenshot?: boolean;
  /** Maximum number of elements to record (default: unlimited) */
  maxElements?: number;
  /** Additional metadata to include */
  metadata?: Record<string, unknown>;
}

export interface RecordPageElementsResult {
  /** Array of recorded elements */
  elements: ElementRecord[];
  /** Total elements found */
  totalFound: number;
  /** Elements recorded (may be less than totalFound if maxElements is set) */
  totalRecorded: number;
  /** Output file path (if outputPath was provided) */
  outputPath?: string;
  /** Screenshot path (if includeScreenshot was true) */
  screenshotPath?: string;
}

/**
 * Record all interactive elements on the page.
 *
 * This function scans the DOM for interactive elements and records their
 * selectors, state, and context. Useful for debugging when selectors fail
 * or when you need to understand what's actually on the page.
 */
export async function recordPageElements(
  page: Page,
  options: RecordPageElementsOptions = {}
): Promise<RecordPageElementsResult> {
  const {
    filterBySelector,
    includeNonInteractive = false,
    outputPath,
    includeScreenshot = false,
    maxElements,
    metadata = {},
  } = options;

  // Record elements using page.evaluate
  const result = await page.evaluate(
    (opts) => {
      const {
        filterSelector,
        includeNonInteractive: includeNonInt,
        maxElements: maxEls,
      } = opts;

      /**
       * Generate XPath for an element
       */
      function getXPath(element: Element): string {
        if (element.id) {
          return `//*[@id="${element.id}"]`;
        }
        if (element === document.body) {
          return "/html/body";
        }
        if (element === document.documentElement) {
          return "/html";
        }

        let ix = 0;
        const siblings = element.parentNode
          ? Array.from(element.parentNode.children)
          : [];
        for (const sibling of siblings) {
          if (!sibling) {
            continue;
          }
          if (sibling === element) {
            const tagName = element.tagName.toLowerCase();
            const parentXPath = element.parentElement
              ? getXPath(element.parentElement)
              : "";
            return `${parentXPath}/${tagName}[${ix + 1}]`;
          }
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
          }
        }
        return "";
      }

      /**
       * Get all selector types for an element
       */
      function getSelectors(element: HTMLElement): ElementRecord["selectors"] {
        const selectors: ElementRecord["selectors"] = {};

        // ID selector
        if (element.id) {
          selectors.id = `#${element.id}`;
        }

        // Name attribute
        if (element.getAttribute("name")) {
          selectors.name = `[name="${element.getAttribute("name")}"]`;
        }

        // Class selectors
        if (element.className && typeof element.className === "string") {
          const classes = element.className
            .split(" ")
            .filter((c) => c.length > 0);
          if (classes.length > 0) {
            selectors.classes = classes;
          }
        }

        // XPath
        try {
          selectors.xpath = getXPath(element);
        } catch {
          // XPath generation failed, skip it
        }

        // Data attributes
        const dataAttrs: Record<string, string> = {};
        for (const attr of Array.from(element.attributes)) {
          if (attr.name.startsWith("data-")) {
            dataAttrs[attr.name] = attr.value;
          }
        }
        if (Object.keys(dataAttrs).length > 0) {
          selectors.dataAttributes = dataAttrs;
        }

        // CSS selector (most specific)
        if (element.id) {
          selectors.css = `#${element.id}`;
        } else if (element.className && typeof element.className === "string") {
          const classes = element.className
            .split(" ")
            .filter((c) => c.length > 0);
          if (classes.length > 0) {
            selectors.css = `.${classes[0]}`;
          }
        }

        return selectors;
      }

      /**
       * Get element type
       */
      function getElementType(element: HTMLElement): ElementRecord["type"] {
        const tagName = element.tagName.toLowerCase();
        const type = (element as HTMLInputElement).type?.toLowerCase();

        if (tagName === "input") {
          if (type === "checkbox") {
            return "checkbox";
          }
          if (type === "radio") {
            return "radio";
          }
          if (type === "button" || type === "submit") {
            return "button";
          }
          return "input";
        }
        if (tagName === "button") {
          return "button";
        }
        if (tagName === "select") {
          return "select";
        }
        if (tagName === "textarea") {
          return "textarea";
        }
        if (tagName === "a") {
          return "link";
        }
        return "other";
      }

      /**
       * Get element state
       */
      function getElementState(element: HTMLElement): ElementRecord["state"] {
        const state: ElementRecord["state"] = {};

        if (element instanceof HTMLInputElement) {
          if (element.type === "checkbox" || element.type === "radio") {
            state.checked = element.checked;
          } else {
            state.value = element.value;
          }
          state.disabled = element.disabled;
          state.required = element.required;
        } else if (element instanceof HTMLSelectElement) {
          state.value = element.value;
          state.disabled = element.disabled;
          state.required = element.required;
        } else if (element instanceof HTMLTextAreaElement) {
          state.value = element.value;
          state.disabled = element.disabled;
          state.required = element.required;
        } else if (element instanceof HTMLButtonElement) {
          state.disabled = element.disabled;
        }

        // Check visibility
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        state.visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0";

        return state;
      }

      /**
       * Get associated label
       */
      function getLabel(element: HTMLElement): string | undefined {
        // Check aria-label
        const ariaLabel = element.getAttribute("aria-label");
        if (ariaLabel) {
          return ariaLabel;
        }

        // Check aria-labelledby
        const labelledBy = element.getAttribute("aria-labelledby");
        if (labelledBy) {
          const labelEl = document.getElementById(labelledBy);
          if (labelEl) {
            return labelEl.textContent?.trim() || undefined;
          }
        }

        // Check for associated label element
        if (element.id) {
          const labelEl = document.querySelector(`label[for="${element.id}"]`);
          if (labelEl) {
            return labelEl.textContent?.trim() || undefined;
          }
        }

        // Check parent label
        const parentLabel = element.closest("label");
        if (parentLabel) {
          return parentLabel.textContent?.trim() || undefined;
        }

        // Check title attribute
        const title = element.getAttribute("title");
        if (title) {
          return title;
        }

        return undefined;
      }

      /**
       * Get parent context
       */
      function getParentContext(
        element: HTMLElement
      ): ElementRecord["context"] {
        const parent = element.parentElement;
        if (!parent) {
          return undefined;
        }

        const context: ElementRecord["context"] = {};

        if (parent.id) {
          context.parentId = parent.id;
        }

        if (parent.className && typeof parent.className === "string") {
          const classes = parent.className
            .split(" ")
            .filter((c) => c.length > 0);
          if (classes.length > 0) {
            context.parentClasses = classes;
          }
        }

        const parentText = parent.textContent?.trim();
        if (parentText && parentText.length < 200) {
          context.parentText = parentText;
        }

        return Object.keys(context).length > 0 ? context : undefined;
      }

      /**
       * Get element attributes
       */
      function getAttributes(
        element: HTMLElement
      ): ElementRecord["attributes"] {
        const attrs: ElementRecord["attributes"] = {};

        if (element instanceof HTMLInputElement) {
          attrs.type = element.type;
        }
        if (
          (element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLButtonElement) &&
          element.name
        ) {
          attrs.name = element.name;
        }
        if (element.id) {
          attrs.id = element.id;
        }
        if (element.className && typeof element.className === "string") {
          attrs.class = element.className;
        }
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          attrs.placeholder = element.placeholder || undefined;
        }
        const title = element.getAttribute("title");
        if (title) {
          attrs.title = title;
        }
        const ariaLabel = element.getAttribute("aria-label");
        if (ariaLabel) {
          attrs["aria-label"] = ariaLabel;
        }
        const ariaLabelledBy = element.getAttribute("aria-labelledby");
        if (ariaLabelledBy) {
          attrs["aria-labelledby"] = ariaLabelledBy;
        }

        return attrs;
      }

      /**
       * Get element position
       */
      function getPosition(
        element: HTMLElement
      ): ElementRecord["position"] | undefined {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          return undefined;
        }

        return {
          x: Math.round(rect.left + window.scrollX),
          y: Math.round(rect.top + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }

      // Find all interactive elements
      const selectors = ["input", "button", "select", "textarea", "a[href]"];

      if (includeNonInt) {
        selectors.push("[role='button']", "[role='link']", "[onclick]");
      }

      let allElements: HTMLElement[] = [];
      for (const selector of selectors) {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(selector)
        );
        allElements.push(...elements);
      }

      // Remove duplicates
      allElements = Array.from(new Set(allElements));

      // Apply filter if provided
      if (filterSelector) {
        try {
          const filtered = Array.from(
            document.querySelectorAll<HTMLElement>(filterSelector)
          );
          const filteredSet = new Set(filtered);
          allElements = allElements.filter((el) => {
            // Check if element matches filter or is descendant of filtered element
            return filteredSet.has(el) || filtered.some((f) => f.contains(el));
          });
        } catch {
          // Invalid selector, skip filter
        }
      }

      // Record elements
      const records: ElementRecord[] = [];
      const limit = maxEls || allElements.length;

      for (let i = 0; i < Math.min(allElements.length, limit); i++) {
        const element = allElements[i];
        if (!element) {
          continue;
        }

        const selectors = getSelectors(element);
        const primarySelector =
          selectors.id ||
          selectors.css ||
          selectors.name ||
          selectors.xpath ||
          "";

        const record: ElementRecord = {
          selector: primarySelector,
          selectors,
          type: getElementType(element),
          state: getElementState(element),
          label: getLabel(element),
          attributes: getAttributes(element),
          position: getPosition(element),
          context: getParentContext(element),
        };

        records.push(record);
      }

      return {
        elements: records,
        totalFound: allElements.length,
        totalRecorded: records.length,
      };
    },
    {
      filterSelector: filterBySelector,
      includeNonInteractive,
      maxElements,
    }
  );

  // Save to file if outputPath provided
  let savedPath: string | undefined;
  if (outputPath) {
    const outputData = {
      timestamp: new Date().toISOString(),
      url: page.url(),
      metadata,
      ...result,
    };

    const fullPath = join(process.cwd(), outputPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, JSON.stringify(outputData, null, 2), "utf-8");
    savedPath = fullPath;
  }

  // Save screenshot if requested
  let screenshotPath: string | undefined;
  if (includeScreenshot && outputPath) {
    const screenshotName = outputPath.endsWith(".json")
      ? `${outputPath.slice(0, -5)}.png`
      : `${outputPath}.png`;
    const fullScreenshotPath = join(process.cwd(), screenshotName);
    await page.screenshot({
      path: fullScreenshotPath,
      fullPage: true,
    });
    screenshotPath = fullScreenshotPath;
  }

  return {
    ...result,
    outputPath: savedPath,
    screenshotPath,
  };
}

/**
 * Record elements and save to debug directory with timestamp.
 * Convenience function for quick debugging.
 */
export function recordPageElementsToDebug(
  page: Page,
  label: string,
  options: Omit<RecordPageElementsOptions, "outputPath"> = {}
): Promise<RecordPageElementsResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `debug/${label}-${timestamp}.json`;
  return recordPageElements(page, {
    ...options,
    outputPath: filename,
    includeScreenshot: true,
  });
}

/**
 * Record elements for a specific category/section when validation fails.
 * Useful for debugging missing fields in Page 4 categories.
 *
 * @example
 * // In getPage4State or test validation
 * if (!state.categoryC4.hasApplyWaterPreventMethods) {
 *   await recordCategoryElements(page, 'category-c4', {
 *     filterBySelector: '[id*="siTable:27"]'
 *   });
 * }
 */
export function recordCategoryElements(
  page: Page,
  categoryName: string,
  filterSelector: string,
  options: Omit<
    RecordPageElementsOptions,
    "outputPath" | "filterBySelector"
  > = {}
): Promise<RecordPageElementsResult> {
  return recordPageElementsToDebug(page, `category-${categoryName}`, {
    ...options,
    filterBySelector: filterSelector,
    metadata: {
      category: categoryName,
      filterSelector,
      ...options.metadata,
    },
  });
}

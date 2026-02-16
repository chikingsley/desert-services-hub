# Element Recorder Utility

A debugging utility for recording available elements on the page, similar to Stagehand v3's observe pattern but focused on element discovery and state capture.

## Purpose

When selectors fail or fields aren't being detected, this utility helps you:
- See what elements are actually available on the page
- Capture multiple selector types for each element (ID, class, XPath, etc.)
- Record element state (checked, value, disabled, visible)
- Save recordings for posterity and debugging

## Basic Usage

### Record all interactive elements

```typescript
import { recordPageElements } from "tests/e2e/utils/element-recorder";

// Record all interactive elements
const result = await recordPageElements(page);
console.log(`Found ${result.totalFound} elements`);
console.log(`Recorded ${result.totalRecorded} elements`);
```

### Record elements in a specific section

```typescript
// Record Category C4 elements
const result = await recordPageElements(page, {
  filterBySelector: '[id*="siTable:27"]',
  outputPath: 'debug/category-c4-elements.json',
  includeScreenshot: true
});
```

### Record and save to debug directory

```typescript
import { recordPageElementsToDebug } from "tests/e2e/utils/element-recorder";

// Automatically saves to debug/ with timestamp
const result = await recordPageElementsToDebug(page, 'category-c4', {
  filterBySelector: '[id*="siTable:27"]'
});
// Saves to: debug/category-c4-2025-01-15T10-30-45-123Z.json
```

### Record category elements on validation failure

```typescript
import { recordCategoryElements } from "tests/e2e/utils/element-recorder";

// In test validation or getPage4State
if (!state.categoryC4.hasApplyWaterPreventMethods) {
  await recordCategoryElements(
    page,
    'c4',
    '[id*="siTable:27"]'
  );
  // Saves to: debug/category-c4-2025-01-15T10-30-45-123Z.json
}
```

## Integration Examples

### In test files (on validation failure)

```typescript
import { recordPageElementsToDebug } from "tests/e2e/utils/element-recorder";

test("fill page 4", async () => {
  const success = await fillPage4(page, data);
  const state = await getPage4State(page);
  
  if (!state.categoryC4.hasApplyWaterPreventMethods) {
    // Record Category C4 elements for debugging
    await recordPageElementsToDebug(page, 'category-c4-failure', {
      filterBySelector: '[id*="siTable:27"]',
      metadata: {
        test: 'fill-page-4',
        category: 'C4',
        missingField: 'hasApplyWaterPreventMethods'
      }
    });
  }
});
```

### In fillPage4 (on error)

```typescript
import { recordPageElementsToDebug } from "tests/e2e/utils/element-recorder";

export async function fillPage4(page: Page, data: FormData): Promise<boolean> {
  try {
    // ... fill logic ...
  } catch (error) {
    // Record elements when filling fails
    await recordPageElementsToDebug(page, 'fill-page-4-error', {
      filterBySelector: '[id*="siTable:27"]',
      metadata: {
        error: error.message,
        url: page.url()
      }
    });
    throw error;
  }
}
```

### In getPage4State (when selectors fail)

```typescript
import { recordPageElements } from "tests/e2e/utils/element-recorder";

export async function getPage4State(page: Page): Promise<Page4State> {
  return await page.evaluate((sels) => {
    // ... validation logic ...
    
    // If validation fails, record elements
    if (someConditionFails) {
      // Note: Can't call async functions in evaluate, so record outside
      // This is just conceptual
    }
  }, selectors);
  
  // Record if needed (outside evaluate)
  if (needsRecording) {
    await recordPageElements(page, {
      filterBySelector: '[id*="siTable:27"]',
      outputPath: 'debug/getPage4State-failure.json'
    });
  }
}
```

## Output Format

The recorded JSON file contains:

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "url": "https://...",
  "metadata": {
    "category": "C4"
  },
  "elements": [
    {
      "selector": "#ThePage:siTable:27:sioTable:42:siForm:checkboxTable:0:checkbox",
      "selectors": {
        "id": "#ThePage:siTable:27:sioTable:42:siForm:checkboxTable:0:checkbox",
        "xpath": "//*[@id=\"ThePage:siTable:27:sioTable:42:siForm:checkboxTable:0:checkbox\"]",
        "css": "#ThePage:siTable:27:sioTable:42:siForm:checkboxTable:0:checkbox"
      },
      "type": "checkbox",
      "state": {
        "checked": true,
        "disabled": false,
        "visible": true
      },
      "label": "ditches",
      "attributes": {
        "id": "ThePage:siTable:27:sioTable:42:siForm:checkboxTable:0:checkbox",
        "name": "ThePage:siTable:27:sioTable:42:siForm:checkboxTable:0:checkbox",
        "type": "checkbox"
      },
      "position": {
        "x": 1234,
        "y": 567,
        "width": 20,
        "height": 20
      },
      "context": {
        "parentId": "ThePage:siTable:27:sioTable:42:siForm:checkboxTable:tbody_element",
        "parentClasses": ["x6"]
      }
    }
  ],
  "totalFound": 150,
  "totalRecorded": 150
}
```

## Options

- `filterBySelector`: Filter elements by CSS selector (e.g., `'[id*="siTable:27"]'`)
- `includeNonInteractive`: Include non-interactive elements (default: false)
- `outputPath`: Path to save JSON file (relative to project root)
- `includeScreenshot`: Save screenshot alongside JSON (default: false)
- `maxElements`: Limit number of elements recorded (default: unlimited)
- `metadata`: Additional metadata to include in output

## Tips

1. **Use filterBySelector** to focus on specific sections (e.g., Category C4)
2. **Include screenshots** for visual debugging alongside element data
3. **Add metadata** to track test context, errors, or other debugging info
4. **Check the debug/ directory** after test failures to see what was recorded
5. **Compare recordings** between successful and failed runs to identify differences

## Similar Patterns

- **Stagehand v3's `observe()`**: Plans actions, but doesn't record element state
- **Agent-browser's `snapshot -i`**: Records interactive elements with refs
- **Your existing HTML snapshots**: Full HTML capture, but not structured element data

This utility combines the best of both: structured element data with multiple selector types and state information.

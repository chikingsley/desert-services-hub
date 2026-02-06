/**
 * Explore ESRI Editor Widget API
 *
 * Opens a map popup and explores the Editor widget's structure
 * to find the correct way to select templates.
 *
 * Run: HEADLESS=false bun scripts/explore-editor-api.ts
 */

import { chromium } from "playwright";

import { createExistingCompanyApplication, goToPage } from "../src/portal/create";
import { findEsriFrame, openMapPopup } from "../src/portal/create/fill/page2/map";
import { deleteByApplicationId } from "../src/portal/delete";
import { login } from "../src/portal/utils/login";
import { sleep } from "../src/portal/utils/helpers";

const COMPANY_NAME = "Sundt Construction Inc";
const COPY_FROM_APP = "D0062461";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  const page = await context.newPage();

  try {
    // Login
    await login(page);

    // Create application
    const result = await createExistingCompanyApplication(page, context, COMPANY_NAME, COPY_FROM_APP);
    if (!result.success) throw new Error("Failed to create application");
    const appId = result.applicationId;
    if (!appId) throw new Error("Application ID missing");
    console.log(`Created: ${appId}`);

    // Go to page 2 and open map
    await goToPage(page, 2);
    const mapPopup = await openMapPopup(page, context);
    if (!mapPopup) throw new Error("Failed to open map popup");

    const esriFrame = await findEsriFrame(mapPopup);
    if (!esriFrame) throw new Error("Failed to find ESRI frame");

    // Wait for editor
    console.log("Waiting for editor...");
    await sleep(5000);

    // Explore the Editor widget structure
    const exploration = await esriFrame.evaluate(() => {
      const dijit = (window as unknown as Record<string, { registry?: { byId?: (id: string) => unknown } }>).dijit;
      const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0") as Record<string, unknown> | undefined;

      if (!editor) return { error: "no editor" };

      const result: Record<string, unknown> = {
        editorKeys: Object.keys(editor),
      };

      // Examine templatePicker
      const tp = editor.templatePicker as Record<string, unknown> | undefined;
      if (tp) {
        result.templatePickerKeys = Object.keys(tp);
        result.templatePickerType = tp.declaredClass;

        // Check for items/templates
        if (tp.items) {
          result.tpItems = tp.items;
        }
        if (tp.featureLayers) {
          const layers = tp.featureLayers as Array<Record<string, unknown>>;
          result.featureLayerCount = layers.length;
          result.firstLayerName = layers[0]?.name;
        }
        if (tp._flItems) {
          result.flItems = (tp._flItems as Array<unknown>).length;
        }

        // Check for selection methods
        result.hasSelectMethod = typeof tp.select === "function";
        result.hasUpdate = typeof tp.update === "function";
        result.hasGetSelected = typeof tp.getSelected === "function";
        result.hasOnSelectionChange = typeof tp.onSelectionChange === "function";

        // Try getSelected
        if (typeof tp.getSelected === "function") {
          result.currentSelection = tp.getSelected();
        }

        // Look at grid
        const grid = tp.grid as Record<string, unknown> | undefined;
        if (grid) {
          result.gridKeys = Object.keys(grid);
          result.gridStore = grid.store ? "exists" : "none";

          const store = grid.store as { data?: unknown } | undefined;
          if (store?.data) {
            const data = store.data as Array<Record<string, unknown>>;
            result.storeDataCount = data.length;
            result.firstStoreItem = data[0] ? {
              label: data[0].label,
              type: data[0].type,
              keys: Object.keys(data[0]),
            } : null;
          }
        }

        // Look for _cellWidgets or similar
        if (tp._cellWidgets) {
          result.cellWidgetCount = (tp._cellWidgets as Array<unknown>).length;
        }
        if (tp._selectedCell) {
          result.selectedCell = tp._selectedCell;
        }
      }

      // Examine drawToolbar
      const dt = editor._drawToolbar as Record<string, unknown> | undefined;
      if (dt) {
        result.drawToolbarKeys = Object.keys(dt);
        result.currentGeometryType = dt._geometryType;
        result.hasActivate = typeof dt.activate === "function";
        result.hasDeactivate = typeof dt.deactivate === "function";
      }

      // Look for editToolbar
      const et = editor._editToolbar as Record<string, unknown> | undefined;
      if (et) {
        result.editToolbarKeys = Object.keys(et);
      }

      // Look at settings
      if (editor.settings) {
        const settings = editor.settings as Record<string, unknown>;
        result.settingsKeys = Object.keys(settings);
        result.layerInfosCount = (settings.layerInfos as Array<unknown>)?.length;
      }

      return result;
    });

    console.log("\n=== EDITOR EXPLORATION ===\n");
    console.log(JSON.stringify(exploration, null, 2));

    // Now try to find and click templates directly
    const templateElements = await esriFrame.evaluate(() => {
      const elements: Array<{ id: string; text: string; tagName: string; className: string }> = [];

      // Find all tpick-surface elements
      const tpicks = document.querySelectorAll("[id^='tpick-surface-']");
      for (const el of tpicks) {
        elements.push({
          id: el.id,
          text: el.textContent?.trim().substring(0, 50) || "",
          tagName: el.tagName,
          className: el.className,
        });
      }

      // Also look for template picker cells
      const cells = document.querySelectorAll(".dojoxGridCell, .templatePicker td, [class*='template']");
      for (const cell of cells) {
        if (!cell.id.startsWith("tpick-")) {
          elements.push({
            id: cell.id || "no-id",
            text: cell.textContent?.trim().substring(0, 50) || "",
            tagName: cell.tagName,
            className: cell.className,
          });
        }
      }

      return elements;
    });

    console.log("\n=== TEMPLATE ELEMENTS ===\n");
    console.log(JSON.stringify(templateElements, null, 2));

    // Pause to allow manual inspection
    console.log("\n\nPausing for 60 seconds - inspect the browser...\n");
    await sleep(60_000);

    // Cleanup
    console.log("\nCleaning up...");
    await mapPopup.close();
    await deleteByApplicationId(page, context, appId);

  } catch (e) {
    console.error("Error:", e);
  } finally {
    await browser.close();
  }
}

main();

/**
 * Simple ESRI Editor exploration - just open a map URL and examine
 */

import { chromium } from "playwright";
import { sleep } from "../src/portal/utils/helpers";

// A direct map URL (will need valid recordId)
const MAP_URL = "https://gis.maricopa.gov/aqd/impact/dust/?recordId=D0062461&newApp=1";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log("Opening map URL...");
    await page.goto(MAP_URL);
    await sleep(10_000); // Wait for map to load

    // Explore the Editor widget
    const exploration = await page.evaluate(() => {
      const dijit = (window as unknown as Record<string, { registry?: { byId?: (id: string) => unknown; toArray?: () => Array<Record<string, unknown>> } }>).dijit;

      if (!dijit?.registry) return { error: "no dijit registry" };

      // List all dijit widgets
      const allWidgets = dijit.registry.toArray?.() || [];
      const widgetInfo = allWidgets.map((w) => ({
        id: w.id,
        declaredClass: w.declaredClass,
      }));

      const editor = dijit.registry.byId?.("esri_dijit_editing_Editor_0") as Record<string, unknown> | undefined;
      if (!editor) return { error: "no editor", widgets: widgetInfo };

      const result: Record<string, unknown> = {
        widgetCount: allWidgets.length,
        editorClass: editor.declaredClass,
      };

      // Look at templatePicker
      const tp = editor.templatePicker as Record<string, unknown> | undefined;
      if (tp) {
        result.tpClass = tp.declaredClass;
        result.tpMethods = Object.keys(tp).filter((k) => typeof tp[k] === "function");

        // Get ALL templates from the picker
        // Try different ways to access templates
        const getItems = tp.getItems || tp.getAllItems;
        if (typeof getItems === "function") {
          result.items = getItems.call(tp);
        }

        // Try _flItems (feature layer items)
        if (tp._flItems) {
          result.flItemsCount = (tp._flItems as Array<unknown>).length;
          const flItems = tp._flItems as Array<Record<string, unknown>>;
          result.flItems = flItems.map((item) => ({
            // _flItems are loosely typed dojo objects
            layerName:
              item.layerName ||
              (item.layer as { name?: string } | undefined)?.name,
            label: item.label,
            type: item.type,
          }));
        }

        // Try attr method
        if (typeof tp.attr === "function") {
          result.selected = (tp.attr as (key: string) => unknown)("value");
        }

        // Check if there's an _onRowClick or similar
        result.hasOnRowClick = typeof tp._onRowClick === "function";
        result.hasSelectionChangeHandler = typeof tp.onSelectionChange === "function";

        // Try to find the actual grid items
        const grid = tp.grid as Record<string, unknown> | undefined;
        if (grid) {
          result.gridClass = grid.declaredClass;

          // Get grid items
          const gridItems = grid._by_idx as Array<Record<string, unknown>> | undefined;
          if (gridItems) {
            result.gridItemCount = gridItems.length;
            result.gridItems = gridItems.slice(0, 10).map((item) => ({
              id: item.id,
              label: (item.item as Record<string, unknown>)?.label,
            }));
          }
        }
      }

      // Look at how templates are actually selected
      // Often this involves firing events on the grid
      result.drawToolbar = editor._drawToolbar ? {
        class: (editor._drawToolbar as Record<string, unknown>).declaredClass,
        geometryType: (editor._drawToolbar as Record<string, unknown>)._geometryType,
      } : null;

      return result;
    });

    console.log("\n=== EXPLORATION ===\n");
    console.log(JSON.stringify(exploration, null, 2));

    // Also dump all tpick elements
    const tpickElements = await page.evaluate(() => {
      const els = document.querySelectorAll("[id^='tpick-']");
      return Array.from(els).map((el) => ({
        id: el.id,
        tagName: el.tagName,
        className: el.className,
        text: el.textContent?.substring(0, 50),
        onclick: (el as HTMLElement).onclick ? "has handler" : "no handler",
      }));
    });

    console.log("\n=== TPICK ELEMENTS ===\n");
    console.log(JSON.stringify(tpickElements, null, 2));

    // Keep open for inspection
    console.log("\n\nKeeping browser open for 2 minutes...\n");
    await sleep(120_000);

  } catch (e) {
    console.error("Error:", e);
  } finally {
    await browser.close();
  }
}

main();

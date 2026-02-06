/**
 * Fill Category K - Water Supply (siTable:50-53)
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import {
  clickRadio,
  fillText,
  fillTextWithSelectors,
  SETTLE_MS,
  setCheckbox,
  sleep,
} from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Category K - Water Supply.
 */
export async function fillCategoryK(page: Page, data: FormData): Promise<void> {
  console.log("  Category K - Water Supply...");

  const k = selectors.categoryK;
  const ds = data.categoryK;
  const ws = ds.waterSources;
  const wm = ds.waterMethods;

  // K soil texture on-site (siTable:50)
  const onSiteValue = ds.soilTexture.onSite;
  await clickRadio(page, k.soilTexture.onSite[onSiteValue]);

  // K soil texture imported (siTable:51)
  const importedValue = ds.soilTexture.imported;
  await clickRadio(page, k.soilTexture.imported[importedValue]);

  // K water sources (siTable:52)
  const kws = k.waterSources;
  if (ws.meteredHydrant) {
    await setCheckbox(page, kws.meteredHydrant.yes, true);
    await sleep(SETTLE_MS);
    if (ws.meteredHydrantQty) {
      await fillTextWithSelectors(
        page,
        kws.meteredHydrantQty,
        String(ws.meteredHydrantQty),
        "K.meteredHydrantQty"
      );
    }
    if (ws.meteredHydrantSize) {
      await fillTextWithSelectors(
        page,
        kws.meteredHydrantSize,
        ws.meteredHydrantSize,
        "K.meteredHydrantSize"
      );
    }
  }
  if (ws.waterTower) {
    await setCheckbox(page, kws.waterTower.yes, true);
    await sleep(SETTLE_MS);
    if (ws.waterTowerQty) {
      await fillTextWithSelectors(
        page,
        kws.waterTowerQty,
        String(ws.waterTowerQty),
        "K.waterTowerQty"
      );
    }
    if (ws.waterTowerSize) {
      await fillTextWithSelectors(
        page,
        kws.waterTowerSize,
        ws.waterTowerSize,
        "K.waterTowerSize"
      );
    }
  }
  if (ws.waterPond) {
    await setCheckbox(page, kws.waterPond.yes, true);
    await sleep(SETTLE_MS);
    if (ws.waterPondQty) {
      await fillTextWithSelectors(
        page,
        kws.waterPondQty,
        String(ws.waterPondQty),
        "K.waterPondQty"
      );
    }
    if (ws.waterPondSize) {
      await fillTextWithSelectors(
        page,
        kws.waterPondSize,
        ws.waterPondSize,
        "K.waterPondSize"
      );
    }
  }
  if (ws.offSite) {
    await setCheckbox(page, kws.offSite.yes, true);
    await sleep(SETTLE_MS);
    if (ws.offSiteQty) {
      await fillTextWithSelectors(
        page,
        kws.offSiteQty,
        String(ws.offSiteQty),
        "K.offSiteQty"
      );
    }
    if (ws.offSiteSize) {
      await fillTextWithSelectors(
        page,
        kws.offSiteSize,
        ws.offSiteSize,
        "K.offSiteSize"
      );
    }
  }
  if (ws.hoseBib) {
    await setCheckbox(page, kws.hoseBib.yes, true);
    await sleep(SETTLE_MS);
    if (ws.hoseBibQty) {
      await fillTextWithSelectors(
        page,
        kws.hoseBibQty,
        String(ws.hoseBibQty),
        "K.hoseBibQty"
      );
    }
    if (ws.hoseBibSize) {
      await fillTextWithSelectors(
        page,
        kws.hoseBibSize,
        ws.hoseBibSize,
        "K.hoseBibSize"
      );
    }
  }
  if (ws.other) {
    await setCheckbox(page, kws.other.yes, true);
    await sleep(SETTLE_MS);
    if (ws.otherDescription) {
      await fillTextWithSelectors(
        page,
        kws.otherDescription,
        ws.otherDescription,
        "K.otherSourceDescription"
      );
    }
    if (ws.otherQty) {
      await fillTextWithSelectors(
        page,
        kws.otherQty,
        String(ws.otherQty),
        "K.otherSourceQty"
      );
    }
    if (ws.otherSize) {
      await fillTextWithSelectors(
        page,
        kws.otherSize,
        ws.otherSize,
        "K.otherSourceSize"
      );
    }
  }

  // K water methods (siTable:53) - ALL checkboxes + text inputs
  const kwm = k.waterMethods;
  if (wm.hose) {
    await setCheckbox(page, kwm.hose.yes, true);
    if (wm.hoseQty) {
      await fillText(page, kwm.hoseQty, String(wm.hoseQty));
    }
    if (wm.hoseSize) {
      await fillText(page, kwm.hoseSize, wm.hoseSize);
    }
  }
  if (wm.waterTruck) {
    await setCheckbox(page, kwm.waterTruck.yes, true);
    if (wm.waterTruckQty) {
      await fillText(page, kwm.waterTruckQty, String(wm.waterTruckQty));
    }
    if (wm.waterTruckSize) {
      await fillText(page, kwm.waterTruckSize, wm.waterTruckSize);
    }
  }
  if (wm.waterPull) {
    await setCheckbox(page, kwm.waterPull.yes, true);
    if (wm.waterPullQty) {
      await fillText(page, kwm.waterPullQty, String(wm.waterPullQty));
    }
    if (wm.waterPullSize) {
      await fillText(page, kwm.waterPullSize, wm.waterPullSize);
    }
  }
  if (wm.waterBuffalo) {
    await setCheckbox(page, kwm.waterBuffalo.yes, true);
    if (wm.waterBuffaloQty) {
      await fillText(page, kwm.waterBuffaloQty, String(wm.waterBuffaloQty));
    }
    if (wm.waterBuffaloSize) {
      await fillText(page, kwm.waterBuffaloSize, wm.waterBuffaloSize);
    }
  }
  if (wm.other) {
    await setCheckbox(page, kwm.other.yes, true);
    if (wm.otherDescription) {
      await fillText(page, kwm.otherDescription, wm.otherDescription);
    }
    if (wm.otherQty) {
      await fillText(page, kwm.otherQty, String(wm.otherQty));
    }
    if (wm.otherSize) {
      await fillText(page, kwm.otherSize, wm.otherSize);
    }
  }
}

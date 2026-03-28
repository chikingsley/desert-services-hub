import { setTimeout as sleep } from "node:timers/promises";

import type { Frame, Page } from "playwright";

import { buildParcelSelectionPayload } from "./pima-gis";
import type { ParcelSelectionPayload } from "./pima-gis";

interface PimaTestHookResult {
  error?: string;
  success: boolean;
}

interface PimaTestHooksWindow extends Window {
  __PIMA_TEST_HOOKS?: {
    selectParcel?: (parcelId: string) => Promise<PimaTestHookResult>;
  };
}

export interface PortalCredentials {
  password: string;
  username: string;
}

export interface StartApplicationSpikeResult {
  finalResumeUrl: string;
  mapSelectionMethod:
    | "embedded-map-handler"
    | "native-click"
    | "postmessage-fallback";
  recordLinkUrl: string;
}

const LOGIN_URL =
  "https://aca-prod.accela.com/PIMA/Login.aspx?ReturnUrl=/Pima/Customization/common/home.aspx";
const HOME_PATH_FRAGMENT = "/customization/common/home.aspx";
const WIZARD_FRAME_NAME = "ACAFrameWizard";
const MAP_FRAME_FRAGMENT = "map-combo.html";
const MAP_COMBO_ROUTE_GLOB =
  "**/content/gwiz/pima/application-wizard/map-combo.html*";
const DEFAULT_TIMEOUT_MS = 30_000;

const MAP_COMBO_HOOK_SCRIPT = `
window.__PIMA_TEST_HOOKS = {
  async selectParcel(parcelId) {
    const normalizedParcelId = String(parcelId ?? "").replace(/\\D/g, "");
    const result = await parcelLayer.queryFeatures({
      where: \`PARCEL='\${normalizedParcelId}'\`,
      outFields: ["*"],
      returnGeometry: true
    });
    if (!result.features.length) {
      return { success: false, error: "parcel not found" };
    }

    const feature = result.features[0];
    const rings = feature.geometry?.rings ?? [];
    const firstRing = Array.isArray(rings) ? rings[0] : null;
    if (!Array.isArray(firstRing) || firstRing.length === 0) {
      return { success: false, error: "missing ring" };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const coordinate of firstRing) {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        continue;
      }

      const [x, y] = coordinate;
      if (typeof x !== "number" || typeof y !== "number") {
        continue;
      }

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxY)
    ) {
      return { success: false, error: "invalid parcel bounds" };
    }

    const mapPoint = {
      spatialReference: feature.geometry?.spatialReference ?? view.spatialReference,
      type: "point",
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    };

    highlightParcelBoundary(feature);
    highlightParcel(feature);

    await selectAddressByAPN(
      {
        PARCEL: normalizedParcelId,
        latitude: mapPoint.y,
        longitude: mapPoint.x
      },
      feature.geometry,
      mapPoint
    );

    return { success: true };
  }
};`;

const waitForFrame = async (
  page: Page,
  predicate: (frame: Frame) => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Frame> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = page.frames().find(predicate);
    if (match) {
      return match;
    }

    await sleep(250);
  }

  throw new Error("Timed out waiting for expected frame");
};

const waitForPortalHome = async (
  page: Page,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<void> => {
  await page
    .waitForURL((url) => url.href.toLowerCase().includes(HOME_PATH_FRAGMENT), {
      timeout: timeoutMs,
    })
    .catch(() => {
      const onHome = page.url().toLowerCase().includes(HOME_PATH_FRAGMENT);
      if (!onHome) {
        throw new Error("Timed out waiting for Pima portal home");
      }
    });
};

const dismissAnnouncementIfPresent = async (page: Page): Promise<void> => {
  const closeButton = page.locator("#close-announcement").first();
  if ((await closeButton.count()) === 0) {
    return;
  }

  await closeButton.click({ timeout: 5000 }).catch(() => {
    // The announcement is optional and does not always block automation.
  });
};

const getWizardFrame = async (page: Page): Promise<Frame> =>
  await waitForFrame(page, (frame) => frame.name() === WIZARD_FRAME_NAME);

const getMapFrame = async (page: Page): Promise<Frame> => {
  const wizardFrame = await getWizardFrame(page);
  const existing = wizardFrame
    .childFrames()
    .find((frame) => frame.url().includes(MAP_FRAME_FRAGMENT));
  if (existing) {
    return existing;
  }

  return await waitForFrame(
    page,
    (frame) =>
      frame.parentFrame() === wizardFrame &&
      frame.url().includes(MAP_FRAME_FRAGMENT)
  );
};

export const installPimaMapHooks = async (page: Page): Promise<void> => {
  const instrumentedPage = page as Page & {
    __pimaMapHooksInstalled?: boolean;
  };
  if (instrumentedPage.__pimaMapHooksInstalled) {
    return;
  }

  instrumentedPage.__pimaMapHooksInstalled = true;

  await page.route(MAP_COMBO_ROUTE_GLOB, async (route) => {
    const response = await route.fetch();
    let body = await response.text();

    if (!body.includes("__PIMA_TEST_HOOKS")) {
      body = body.replace(
        "        function sendParentMessage(action, data) {",
        `${MAP_COMBO_HOOK_SCRIPT}\n\n        function sendParentMessage(action, data) {`
      );
    }

    await route.fulfill({
      body,
      response,
    });
  });
};

const clickPermitGatewayCard = async (page: Page): Promise<void> => {
  const clicked = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll("a.card-link.circle_color")];
    const candidate = anchors.find((node) =>
      (node.getAttribute("onclick") ?? "").includes("openWizard()")
    );

    if (!(candidate instanceof HTMLAnchorElement)) {
      return false;
    }

    candidate.click();
    return true;
  });

  if (!clicked) {
    throw new Error("Could not find the Permit Gateway application card");
  }
};

const hasPermitGatewayCard = async (page: Page): Promise<boolean> => {
  try {
    return await page.evaluate(() => {
      const anchors = [
        ...document.querySelectorAll("a.card-link.circle_color"),
      ];
      return anchors.some((node) =>
        (node.getAttribute("onclick") ?? "").includes("openWizard()")
      );
    });
  } catch {
    return false;
  }
};

const waitForGatewayReady = async (page: Page): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const hasApplyLink = (await page.locator("a#Start-menuitem").count()) > 0;
    if (hasApplyLink || (await hasPermitGatewayCard(page))) {
      return;
    }

    await sleep(250);
  }
};

const clickVisibleContinue = async (wizardFrame: Frame): Promise<void> => {
  const clicked = await wizardFrame.evaluate(() => {
    const buttons = [
      ...document.querySelectorAll("a, button, [role='button']"),
    ];

    const match = buttons.find((node) =>
      /^Continue(?:\s|$)/i.test((node.textContent ?? "").trim())
    );
    if (!(match instanceof HTMLElement)) {
      return false;
    }

    match.click();
    return true;
  });

  if (!clicked) {
    throw new Error("Could not find the current Continue action");
  }
};

const getContinueClassName = async (wizardFrame: Frame): Promise<string> =>
  (await wizardFrame.evaluate(() => {
    const buttons = [
      ...document.querySelectorAll("a, button, [role='button']"),
    ];
    const match = buttons.find((node) =>
      /^Continue(?:\s|$)/i.test((node.textContent ?? "").trim())
    );

    return match instanceof HTMLElement ? match.className : "";
  })) ?? "";

const isContinueDisabled = async (wizardFrame: Frame): Promise<boolean> => {
  const className = await getContinueClassName(wizardFrame);
  return className.includes("ztdisabled");
};

const seedParcelSelection = async (
  mapFrame: Frame,
  selection: ParcelSelectionPayload
): Promise<void> => {
  await mapFrame.evaluate((payload) => {
    window.parent.postMessage(
      {
        action: "update",
        data: payload,
        from: "map",
      },
      "*"
    );
  }, selection);
};

const waitForContinueEnabled = async (
  wizardFrame: Frame,
  timeoutMs = 8000
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isContinueDisabled(wizardFrame))) {
      return true;
    }

    await sleep(500);
  }

  return false;
};

const attemptPostMessageSelection = async (
  page: Page,
  wizardFrame: Frame,
  parcelId: string
): Promise<boolean> => {
  try {
    const selection = await buildParcelSelectionPayload(parcelId);
    const mapFrame = await getMapFrame(page);
    await seedParcelSelection(mapFrame, selection);
    await sleep(1500);
    return await waitForContinueEnabled(wizardFrame);
  } catch {
    return false;
  }
};

const attemptEmbeddedMapHandlerSelection = async (
  page: Page,
  wizardFrame: Frame,
  parcelId: string
): Promise<boolean> => {
  try {
    const mapFrame = await getMapFrame(page);
    const input = mapFrame
      .locator(
        'input[aria-label="Search"], input[placeholder="Find address or place"], input[type="text"]'
      )
      .first();

    await input.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
    await input.fill(parcelId);
    await sleep(3000);

    const suggestion = mapFrame
      .locator("[role=option]")
      .filter({ hasText: new RegExp(`^${parcelId}$`) })
      .first();
    if ((await suggestion.count()) > 0) {
      await suggestion.click().catch(() => {
        // Continue with the embedded handler even if the suggestion click is ignored.
      });
      await sleep(2000);
    }

    const result = (await mapFrame
      .evaluate(
        (targetParcel) => {
          const mapWindow = window as PimaTestHooksWindow;
          return (
            mapWindow.__PIMA_TEST_HOOKS?.selectParcel?.(targetParcel) ?? {
              error: "hooks missing",
              success: false,
            }
          );
        },
        parcelId
      )
      .catch(() => ({ success: false }))) as {
      error?: string;
      success: boolean;
    };

    if (!result.success) {
      return false;
    }

    await sleep(1500);
    return await waitForContinueEnabled(wizardFrame);
  } catch {
    return false;
  }
};

const attemptMapCenterClick = async (
  page: Page,
  wizardFrame: Frame
): Promise<boolean> => {
  const mapFrame = await getMapFrame(page);
  const mapSurface = mapFrame.locator("#map-div").first();
  const mapBounds = await mapSurface.boundingBox().catch(() => null);
  if (!mapBounds) {
    return false;
  }

  await mapSurface.click({
    force: true,
    position: {
      x: Math.max(5, Math.round(mapBounds.width / 2)),
      y: Math.max(5, Math.round(mapBounds.height / 2)),
    },
  });

  await sleep(2000);
  return await waitForContinueEnabled(wizardFrame);
};

export const ensureLoggedIn = async (
  page: Page,
  credentials: PortalCredentials
): Promise<void> => {
  await page.goto(LOGIN_URL, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });

  const loginFrame = await waitForFrame(
    page,
    (frame) => frame.name() === "LoginFrame"
  );

  await loginFrame.locator("#username").fill(credentials.username);
  await loginFrame.locator("#passwordRequired").fill(credentials.password);
  await loginFrame.getByRole("button", { name: /sign in/i }).click();

  await waitForPortalHome(page);
};

export const openPermitGateway = async (page: Page): Promise<void> => {
  await dismissAnnouncementIfPresent(page);
  await waitForGatewayReady(page);

  const onGatewayPage =
    page.url().includes("openWizard=true") ||
    (await hasPermitGatewayCard(page));
  if (!onGatewayPage) {
    let opened = false;
    try {
      opened = await page.evaluate(() => {
        const applyLink = document.querySelector("a#Start-menuitem");
        if (applyLink instanceof HTMLAnchorElement) {
          applyLink.click();
          return true;
        }

        const fallback = [...document.querySelectorAll("a")].find((node) =>
          (node.getAttribute("href") ?? "").includes("openWizard=true")
        );
        if (fallback instanceof HTMLAnchorElement) {
          fallback.click();
          return true;
        }

        return false;
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Execution context was destroyed")
      ) {
        opened = true;
      } else {
        throw error;
      }
    }

    if (!opened) {
      throw new Error("Could not open the Permit Gateway from the portal home");
    }

    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (
        page.url().includes("openWizard=true") ||
        (await hasPermitGatewayCard(page))
      ) {
        break;
      }

      await sleep(250);
    }

    if (
      !(
        page.url().includes("openWizard=true") ||
        (await hasPermitGatewayCard(page))
      )
    ) {
      throw new Error("Timed out opening the Permit Gateway page");
    }
  }

  await dismissAnnouncementIfPresent(page);
  await sleep(4000);

  await clickPermitGatewayCard(page);
  await getWizardFrame(page);
  await sleep(2000);
};

export const chooseExactPermitType = async (page: Page): Promise<void> => {
  const wizardFrame = await getWizardFrame(page);
  const exactPermitLink = wizardFrame
    .locator("a")
    .filter({ hasText: /i know my exact permit type/i })
    .first();

  await exactPermitLink.waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await exactPermitLink.click();
  await getMapFrame(page);
  await sleep(2000);
};

export const selectParcelInWizard = async (
  page: Page,
  parcelId: string
): Promise<"embedded-map-handler" | "native-click" | "postmessage-fallback"> => {
  const wizardFrame = await getWizardFrame(page);

  if (await attemptEmbeddedMapHandlerSelection(page, wizardFrame, parcelId)) {
    return "embedded-map-handler";
  }

  if (await attemptPostMessageSelection(page, wizardFrame, parcelId)) {
    return "postmessage-fallback";
  }

  if (await attemptMapCenterClick(page, wizardFrame)) {
    return "native-click";
  }

  if (await isContinueDisabled(wizardFrame)) {
    throw new Error("Continue stayed disabled after parcel selection");
  }

  return "postmessage-fallback";
};

export const continuePastParcelSelection = async (
  page: Page
): Promise<void> => {
  const wizardFrame = await getWizardFrame(page);
  await clickVisibleContinue(wizardFrame);
  await sleep(2000);
};

export const continuePastIncorporatedParcelWarning = async (
  page: Page
): Promise<void> => {
  const wizardFrame = await getWizardFrame(page);
  await wizardFrame
    .locator("body")
    .waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });

  const text = await wizardFrame.textContent("body");
  if (!text?.includes("THIS IS AN INCORPORATED PROPERTY")) {
    throw new Error("Did not reach incorporated parcel warning step");
  }

  await clickVisibleContinue(wizardFrame);
  await sleep(2000);
};

export const selectFugitiveDust = async (page: Page): Promise<void> => {
  const wizardFrame = await getWizardFrame(page);
  const clicked = await wizardFrame.evaluate(() => {
    const candidates = [
      ...document.querySelectorAll(
        "h1, h2, h3, h4, h5, h6, a, button, div, span"
      ),
    ];

    const match = candidates.find((node) =>
      /^Fugitive Dust\b/i.test((node.textContent ?? "").trim())
    );
    if (!(match instanceof HTMLElement)) {
      return false;
    }

    const actionable = match.closest("a, button, [role='button']");
    if (actionable instanceof HTMLElement) {
      actionable.click();
      return true;
    }

    match.click();
    return true;
  });

  if (!clicked) {
    throw new Error("Could not find the Fugitive Dust option");
  }

  await sleep(2000);
};

export const getCitizenAccessRecordLink = async (
  page: Page
): Promise<string> => {
  const wizardFrame = await getWizardFrame(page);
  const recordLink = wizardFrame.locator("a.record-link").first();

  await recordLink.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const href = await recordLink.getAttribute("href");
  if (!href) {
    throw new Error("Citizen Access record link is missing an href");
  }

  return href;
};

export const navigateToCitizenAccessRecord = async (
  page: Page,
  recordLinkUrl: string
): Promise<string> => {
  await page.goto(recordLinkUrl, {
    timeout: 60_000,
    waitUntil: "load",
  });
  await page.waitForURL((url) => url.pathname.includes("/Cap/CapEdit.aspx"), {
    timeout: DEFAULT_TIMEOUT_MS,
  });

  return page.url();
};

export const runStartApplicationSpike = async (
  page: Page,
  credentials: PortalCredentials,
  parcelId: string
): Promise<StartApplicationSpikeResult> => {
  await ensureLoggedIn(page, credentials);
  await openPermitGateway(page);
  await chooseExactPermitType(page);

  const mapSelectionMethod = await selectParcelInWizard(page, parcelId);
  await continuePastParcelSelection(page);
  await continuePastIncorporatedParcelWarning(page);
  await selectFugitiveDust(page);

  const recordLinkUrl = await getCitizenAccessRecordLink(page);
  const finalResumeUrl = await navigateToCitizenAccessRecord(
    page,
    recordLinkUrl
  );

  return {
    finalResumeUrl,
    mapSelectionMethod,
    recordLinkUrl,
  };
};

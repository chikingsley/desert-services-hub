import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Frame, Page } from "playwright";
import { installPimaMapHooks } from "../../src/portal";

interface PimaTestHookResult {
  error?: string;
  success: boolean;
}

interface PimaTestHooksWindow extends Window {
  __PIMA_TEST_HOOKS?: {
    selectParcel?: (parcelId: string) => Promise<PimaTestHookResult>;
  };
}

const LOGIN_URL =
  "https://aca-prod.accela.com/PIMA/Login.aspx?ReturnUrl=/Pima/Customization/common/home.aspx";
const GATEWAY_URL =
  "https://aca-prod.accela.com/PIMA/Customization/common/home.aspx?openWizard=true";
const TARGET_PARCEL = "303091060";
const TARGET_LATITUDE = "32.069688993082295";
const TARGET_LONGITUDE = "-110.91842480624658";
const TARGET_CROSS_STREETS = "Houghton Rd and Valencia Rd";
const DEQ_APPLICANT = {
  address1: "11011 N 23rd Ave",
  businessName: "B&F Contracting, Inc.",
  city: "Phoenix",
  email: "dave.pennebaker@bfcontracting.com",
  firstName: "Dave",
  lastName: "Pennebaker",
  phone: "5202821707",
  state: "AZ",
  zip: "85029",
} as const;
const ACCOUNT_AGENT = {
  address1: "800 N Mary Street",
  city: "Tempe",
  email: "chi@desertservices.net",
  firstSavedAddressCheckbox:
    "#ctl00_phPopup_contactAddressSearchList_gdvContactAddressList_ctl02_CB_0",
  state: "AZ",
  zip: "85288",
} as const;

const sanitize = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_");

const formatPortalDate = (value: Date): string =>
  `${String(value.getMonth() + 1).padStart(2, "0")}/${String(
    value.getDate()
  ).padStart(2, "0")}/${value.getFullYear()}`;

const getSpikeDates = (): { endDate: string; startDate: string } => {
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);

  while (endDate.getDay() === 0 || endDate.getDay() === 6) {
    endDate.setDate(endDate.getDate() - 1);
  }

  return {
    endDate: formatPortalDate(endDate),
    startDate: formatPortalDate(startDate),
  };
};

const dumpFrame = async (
  frame: Frame,
  artifactDir: string,
  label: string,
  index: number
): Promise<void> => {
  const url = frame.url();
  if (!url || url === "about:blank") {
    return;
  }

  const html = await frame
    .content()
    .catch(() => "<!-- frame content unavailable -->");
  await writeFile(join(artifactDir, `${label}.frame-${index}.html`), html, "utf8");
};

const dumpState = async (
  page: Page,
  artifactDir: string,
  label: string
): Promise<void> => {
  const safeLabel = sanitize(label);

  await page
    .screenshot({
      fullPage: true,
      path: join(artifactDir, `${safeLabel}.png`),
    })
    .catch(() => {
      // Best effort only.
    });

  await writeFile(
    join(artifactDir, `${safeLabel}.html`),
    await page.content().catch(() => "<!-- page content unavailable -->"),
    "utf8"
  );

  await writeFile(
    join(artifactDir, `${safeLabel}.meta.json`),
    JSON.stringify(
      {
        frames: page.frames().map((frame) => ({
          name: frame.name(),
          url: frame.url(),
        })),
        pageUrl: page.url(),
      },
      null,
      2
    ),
    "utf8"
  );

  const frames = page.frames();
  for (const [index, frame] of frames.entries()) {
    await dumpFrame(frame, artifactDir, safeLabel, index);
  }
};

const wait = async (page: Page, ms: number): Promise<void> => {
  await page.waitForTimeout(ms);
};

const clickWizardContinue = async (wizardFrame: Frame): Promise<void> => {
  const clicked = await wizardFrame.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("a,button,[role=button]"));
    const match = nodes.find((node) =>
      /^Continue(?:\s|$)/i.test((node.textContent ?? "").trim())
    );
    if (!(match instanceof HTMLElement)) {
      return false;
    }

    match.click();
    return true;
  });

  if (!clicked) {
    throw new Error("Could not find wizard Continue action");
  }
};

const clickWizardCardByTitle = async (
  wizardFrame: Frame,
  title: RegExp
): Promise<void> => {
  const clicked = await wizardFrame.evaluate((patternSource) => {
    const matcher = new RegExp(patternSource, "i");
    const nodes = Array.from(
      document.querySelectorAll("a,button,div,span,h1,h2,h3,h4,h5")
    );
    const match = nodes.find((node) =>
      matcher.test((node.textContent ?? "").trim())
    );

    if (!(match instanceof HTMLElement)) {
      return false;
    }

    const actionable = match.closest("a,button,[role=button]");
    if (actionable instanceof HTMLElement) {
      actionable.click();
      return true;
    }

    match.click();
    return true;
  }, title.source);

  if (!clicked) {
    throw new Error(`Could not find wizard option matching ${title.source}`);
  }
};

const fillByTyping = async (
  page: Page,
  selector: string,
  value: string
): Promise<void> => {
  const locator = page.locator(selector);
  await locator.click();
  await locator.fill("");
  await locator.type(value, { delay: 20 });
};

test("headless spike reaches Step 3 review", async ({ page }) => {
  const username = process.env.PIMA_PORTAL_USERNAME?.trim();
  const password = process.env.PIMA_PORTAL_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error("Missing PIMA_PORTAL_USERNAME or PIMA_PORTAL_PASSWORD");
  }

  const { endDate, startDate } = getSpikeDates();

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactDir = join(
    process.cwd(),
    "output",
    "playwright",
    "start-application-spike",
    runId
  );
  await mkdir(artifactDir, { recursive: true });
  await installPimaMapHooks(page);

  await page.goto(LOGIN_URL, { timeout: 60_000, waitUntil: "load" });
  const loginFrame = page.frame({ name: "LoginFrame" });
  if (!loginFrame) {
    throw new Error("LoginFrame not found");
  }

  await loginFrame.locator("#username").fill(username);
  await loginFrame.locator("#passwordRequired").fill(password);
  await loginFrame.getByRole("button", { name: /sign in/i }).click();
  await wait(page, 4_000);
  await dumpState(page, artifactDir, "01-logged-in");

  await page.goto(GATEWAY_URL, { timeout: 60_000, waitUntil: "load" });
  await wait(page, 4_000);
  await page.locator("#close-announcement").click({ timeout: 5_000 }).catch(() => {});
  await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a.card-link.circle_color"));
    const candidate = anchors.find((node) =>
      (node.getAttribute("onclick") ?? "").includes("openWizard()")
    );
    if (candidate instanceof HTMLAnchorElement) {
      candidate.click();
    }
  });
  await wait(page, 4_000);
  await dumpState(page, artifactDir, "02-gateway-opened");

  const wizardFrame = page.frame({ name: "ACAFrameWizard" });
  if (!wizardFrame) {
    throw new Error("ACAFrameWizard not found");
  }

  await wizardFrame.locator("a").filter({ hasText: /i know my exact permit type/i }).first().click();
  await wait(page, 3_000);
  await dumpState(page, artifactDir, "03-exact-permit-step");

  const mapFrame = wizardFrame.childFrames().find((frame) =>
    frame.url().includes("map-combo.html")
  );
  if (!mapFrame) {
    throw new Error("map-combo frame not found");
  }

  const mapInput = mapFrame
    .locator(
      'input[aria-label="Search"], input[placeholder="Find address or place"], input[type="text"]'
    )
    .first();
  await mapInput.fill(TARGET_PARCEL);
  await wait(page, 3000);
  const suggestion = mapFrame
    .locator("[role=option]")
    .filter({ hasText: new RegExp(`^${TARGET_PARCEL}$`) })
    .first();
  if ((await suggestion.count()) > 0) {
    await suggestion.click().catch(() => {
      // The injected map handler below is the authoritative selection path.
    });
    await wait(page, 2000);
  }

  const mapSelectionResult = (await mapFrame.evaluate((parcelId) => {
    const mapWindow = window as PimaTestHooksWindow;
    return (
      mapWindow.__PIMA_TEST_HOOKS?.selectParcel?.(parcelId) ?? {
        error: "hooks missing",
        success: false,
      }
    );
  }, TARGET_PARCEL)) as PimaTestHookResult;
  expect(mapSelectionResult.success).toBe(true);
  await wait(page, 1500);
  await clickWizardContinue(wizardFrame);
  await wait(page, 2_000);
  await dumpState(page, artifactDir, "04-parcel-selected");

  await clickWizardContinue(wizardFrame);
  await wait(page, 2_000);
  await dumpState(page, artifactDir, "05-incorporated-warning");

  await clickWizardCardByTitle(wizardFrame, /^Fugitive Dust\b/);
  await wait(page, 2_500);
  await dumpState(page, artifactDir, "06-fugitive-dust-choice");

  const recordLinkUrl = await wizardFrame.locator("a.record-link").getAttribute("href");
  if (!recordLinkUrl) {
    throw new Error("record-link href missing");
  }

  await page.goto(recordLinkUrl, { timeout: 60_000, waitUntil: "load" });
  await wait(page, 4_000);
  await dumpState(page, artifactDir, "07-capedit-basic-info");

  await page.click("#ctl00_PlaceHolderMain_AppSpec8DA3EF3DEdit_PIMA_rdo_0_3_0");
  await wait(page, 1_500);
  await page
    .selectOption("#ctl00_PlaceHolderMain_AppSpec8DA3EF3DEdit_PIMA_ddl_0_8", {
      label: "1 to 10 acres",
    })
    .catch(() => {
      // The field is hidden until multi-activity is enabled, but still present.
    });
  await page.selectOption("#ctl00_PlaceHolderMain_AppSpec8DA3EF3DEdit_PIMA_ddl_0_9", {
    label: "Commercial",
  });
  await fillByTyping(
    page,
    "#ctl00_PlaceHolderMain_AppSpec8DA3EF3DEdit_PIMA_txt_0_2",
    "LTX5555"
  );
  await fillByTyping(
    page,
    "#ctl00_PlaceHolderMain_AppSpec51CD6B78Edit_PIMA_txt_0_0",
    TARGET_LATITUDE
  );
  await fillByTyping(
    page,
    "#ctl00_PlaceHolderMain_AppSpec51CD6B78Edit_PIMA_txt_0_1",
    TARGET_LONGITUDE
  );
  await fillByTyping(
    page,
    "#ctl00_PlaceHolderMain_AppSpec51CD6B78Edit_PIMA_txt_0_2",
    TARGET_CROSS_STREETS
  );
  // Set the dates last because the page expressions can clear End Date.
  await fillByTyping(
    page,
    "#ctl00_PlaceHolderMain_AppSpec8DA3EF3DEdit_PIMA_txt_0_0",
    startDate
  );
  await fillByTyping(
    page,
    "#ctl00_PlaceHolderMain_AppSpec8DA3EF3DEdit_PIMA_txt_0_1",
    endDate
  );
  await page.click("#ctl00_PlaceHolderMain_actionBarBottom_btnContinue");
  await wait(page, 4_000);
  await dumpState(page, artifactDir, "08-certification");

  await page.locator('input[type="checkbox"]').first().check();
  await page.click("#ctl00_PlaceHolderMain_actionBarBottom_btnContinue");
  await wait(page, 8_000);
  await dumpState(page, artifactDir, "09-applicant-info");

  await page.click("#ctl00_PlaceHolderMain_Contact1_354Edit_btnEdit");
  await wait(page, 4_000);
  let dialogFrame = page.frames().find((frame) =>
    frame.url().includes("/People/ContactAddNew.aspx")
  );
  if (!dialogFrame) {
    throw new Error("DEQ applicant contact dialog missing");
  }

  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppOrganizationName")
    .fill(DEQ_APPLICANT.businessName);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppFirstName")
    .fill(DEQ_APPLICANT.firstName);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppLastName")
    .fill(DEQ_APPLICANT.lastName);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppStreetAdd1")
    .fill(DEQ_APPLICANT.address1);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppCity")
    .fill(DEQ_APPLICANT.city);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppState_State1")
    .fill(DEQ_APPLICANT.state);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppZipApplicant")
    .fill(DEQ_APPLICANT.zip);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppPhone1")
    .fill(DEQ_APPLICANT.phone);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppEmail")
    .fill(DEQ_APPLICANT.email);
  await dialogFrame.locator("#ctl00_phPopup_btnSave").click();
  await wait(page, 6_000);

  await page.click("#ctl00_PlaceHolderMain_Contact2_440Edit_btnAddFromSaved");
  await wait(page, 4_000);
  dialogFrame = page.frames().find((frame) =>
    frame.url().includes("/People/ContactLookUp.aspx")
  );
  if (!dialogFrame) {
    throw new Error("Applicant Agent select-account dialog missing");
  }

  await dialogFrame.locator(ACCOUNT_AGENT.firstSavedAddressCheckbox).check();
  await dialogFrame.locator("#ctl00_phPopup_btnContinueContactAddress").click();
  await wait(page, 4_000);

  dialogFrame = page.frames().find((frame) =>
    frame.url().includes("/People/ContactAddNew.aspx")
  );
  if (!dialogFrame) {
    throw new Error("Applicant Agent address dialog missing");
  }

  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppStreetAdd1")
    .fill(ACCOUNT_AGENT.address1);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppCity")
    .fill(ACCOUNT_AGENT.city);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppState_State1")
    .fill(ACCOUNT_AGENT.state);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppZipApplicant")
    .fill(ACCOUNT_AGENT.zip);
  await dialogFrame
    .locator("#ctl00_phPopup_ucContactInfo_txtAppEmail")
    .fill(ACCOUNT_AGENT.email);
  await dialogFrame.locator("#ctl00_phPopup_btnSave").click();
  await wait(page, 8_000);
  await dumpState(page, artifactDir, "10-applicant-info-complete");

  await page.click("#ctl00_PlaceHolderMain_actionBarBottom_btnContinue");
  await wait(page, 8_000);
  await dumpState(page, artifactDir, "11-specific-location");

  await page.click("#ctl00_PlaceHolderMain_actionBarBottom_btnContinue");
  await wait(page, 8_000);
  await dumpState(page, artifactDir, "12-attachments");

  await page.click("#ctl00_PlaceHolderMain_actionBarBottom_btnContinue");
  await wait(page, 10_000);
  await dumpState(page, artifactDir, "13-review");

  await writeFile(
    join(artifactDir, "result.json"),
    JSON.stringify(
      {
        finalReviewUrl: page.url(),
        mapSelectionMethod: "embedded-map-handler",
        recordLinkUrl,
        targetParcel: TARGET_PARCEL,
      },
      null,
      2
    ),
    "utf8"
  );

  const bodyText = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
  expect(page.url()).toContain("/CapConfirm.aspx");
  expect(bodyText).toMatch(/Step 3\s*:\s*Review/);
  expect(bodyText).toContain("LTX5555");
  expect(bodyText).toContain("Commercial");
});

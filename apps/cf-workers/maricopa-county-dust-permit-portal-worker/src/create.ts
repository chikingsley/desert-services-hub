import type { Page } from "playwright";

import {
  PORTAL_TIMINGS,
  clickInFrames,
  fillInFrames,
  findInFrames,
  isVisible,
  log,
  pollUntil,
  settlePortalUi,
  waitForVisible,
} from "./portal-shared";

const PORTAL_URL = "https://dm.maricopa.gov/";

const sel = {
  applicationId: '[id="ThePage:applicationId"]',
  companyRadios: 'input[name="RadioButtons"]',
  continueBtn: 'img[alt="Continue"]',
  copyFromSelect: '[id="newDustApplcation:_idJsp24"]',
  createBtn:
    '[id="newDustApplcation:createNewApplication"], img[alt="Create"]',
  disclaimerAgree: '[onclick*="agree"]',
  draftSection: "text=Draft Dust Applications",
  loginBtn:
    'a[id*="loginBtn"], a:has(img[alt="Login"]), input[type="submit"]',
  loginPassword: 'input[id*="password"], input[type="password"]',
  loginUser: 'input[id*="userName"], input[type="text"]',
  logoutLink: 'a:has-text("Logout")',
  myDustApps: "text=My Dust Control Applications",
  newAppBtn: 'img[alt="New Application"]',
  newCompanyCheckbox: '[id="newDustApplcation:newCompany"]',
  reapplicationCheckbox: '[id="newDustApplcation:copyApplication"]',
  showAllCompanies:
    '[id="newDustApplcation:assoicatedCompanies-nb__xc_c"]',
  welcomeText: "text=Welcome,",
} as const;

export interface CreateFlow {
  flow: "new-company" | "existing-company";
  copyFromApp?: string;
  companyName?: string;
}

const isLoggedIn = async (page: Page): Promise<boolean> =>
  (await isVisible(page, sel.myDustApps)) ||
  (await isVisible(page, sel.welcomeText)) ||
  (await isVisible(page, sel.logoutLink)) ||
  (await isVisible(page, sel.newAppBtn));

export const ensureLoggedIn = async (
  page: Page,
  username: string,
  password: string,
): Promise<boolean> => {
  log("LOGIN", "checking current state");
  if (await isLoggedIn(page)) {
    log("LOGIN", "already logged in");
    return true;
  }

  log("LOGIN", "navigating to portal");
  await page.goto(PORTAL_URL, {
    timeout: PORTAL_TIMINGS.sessionMs,
    waitUntil: "load",
  });
  log("LOGIN", "loaded", page.url());

  if (page.url().includes("disclaimer")) {
    log("LOGIN", "handling disclaimer");
    try {
      await page.locator(sel.disclaimerAgree).first().click();
      await page.waitForURL((url) => !url.href.includes("disclaimer"), {
        timeout: PORTAL_TIMINGS.readyMs,
      });
    } catch {
      if (page.url().includes("disclaimer")) {
        log("LOGIN", "FAIL: stuck on disclaimer");
        return false;
      }
    }
  }

  if (await isLoggedIn(page)) {
    log("LOGIN", "logged in after disclaimer");
    return true;
  }

  log("LOGIN", "filling credentials");
  const filledUser = await fillInFrames(page, sel.loginUser, username);
  const filledPass = await fillInFrames(page, sel.loginPassword, password);
  if (!filledUser || !filledPass) {
    log("LOGIN", "FAIL: credentials not filled", {
      filledUser,
      filledPass,
    });
    return false;
  }

  log("LOGIN", "clicking login");
  if (!(await clickInFrames(page, sel.loginBtn))) {
    if (await isLoggedIn(page)) return true;
    log("LOGIN", "FAIL: login click failed");
    return false;
  }

  log("LOGIN", "waiting for post-login indicators");
  const ok = Boolean(
    await pollUntil(() => isLoggedIn(page), {
      timeoutMs: PORTAL_TIMINGS.operationMs,
      isDone: Boolean,
    }),
  );
  log("LOGIN", ok ? "SUCCESS" : "FAIL: timed out");
  return ok;
};

export const openMyDustApps = async (page: Page): Promise<boolean> => {
  const isOnPage = async () =>
    page.url().includes("/dustApplications.jsf") ||
    (await isVisible(page, sel.newAppBtn)) ||
    (await isVisible(page, sel.draftSection));

  if (await isOnPage()) return true;

  log("NAV", "clicking My Dust Control Applications");
  try {
    await page.locator(sel.myDustApps).first().click({
      force: true,
      noWaitAfter: true,
      timeout: PORTAL_TIMINGS.readyMs,
    });
  } catch {
    try {
      await page
        .locator(sel.myDustApps)
        .first()
        .evaluate((el) => (el as HTMLElement).click());
    } catch {
      log("NAV", "FAIL: nav click failed");
      return false;
    }
  }

  const ready = Boolean(
    await pollUntil(isOnPage, {
      timeoutMs: PORTAL_TIMINGS.readyMs,
      isDone: Boolean,
    }),
  );
  if (ready) await settlePortalUi();
  log("NAV", ready ? "on dust apps page" : "FAIL: timed out");
  return ready;
};

const selectCompany = async (
  popup: Page,
  name: string,
): Promise<boolean> => {
  const showAll = await findInFrames(
    popup,
    sel.showAllCompanies,
    PORTAL_TIMINGS.quickMs,
  );
  if (showAll) {
    try {
      await showAll.locator.selectOption("all");
      await settlePortalUi();
    } catch {
      // Dropdown may not be present in every portal state.
    }
  }

  const found = await findInFrames(popup, sel.companyRadios);
  if (!found) return false;

  const radios = found.ctx.locator(sel.companyRadios);
  const count = await radios.count();
  const target = name.toLowerCase();

  for (let i = 0; i < count; i++) {
    const radio = radios.nth(i);
    const text = await radio.evaluate(
      (el) => el.closest("tr")?.textContent ?? "",
    );
    if (!text.toLowerCase().includes(target)) continue;

    try {
      await radio.check({ force: true });
    } catch {
      await radio.click({ force: true });
    }
    await settlePortalUi();
    log("CREATE", "selected company", name);
    return true;
  }

  return false;
};

const checkNewCompany = async (popup: Page): Promise<boolean> => {
  const found = await findInFrames(popup, sel.newCompanyCheckbox);
  if (!found) return false;

  if (!(await found.locator.isChecked())) {
    await found.locator.click({ force: true });
    await settlePortalUi();
  }
  return true;
};

export const runMinimalCreate = async (
  page: Page,
  options: CreateFlow,
): Promise<{ permitId: string | null; error?: string }> => {
  if (!(await openMyDustApps(page))) {
    return { permitId: null, error: "Could not open My Dust Apps" };
  }
  if (
    !(await waitForVisible(page, sel.newAppBtn, PORTAL_TIMINGS.readyMs))
  ) {
    return { permitId: null, error: "New Application button not visible" };
  }

  log("CREATE", "clicking New Application");
  let popupPage: Page;
  try {
    [popupPage] = await Promise.all([
      page
        .context()
        .waitForEvent("page", { timeout: PORTAL_TIMINGS.readyMs }),
      page
        .locator(sel.newAppBtn)
        .first()
        .click({ timeout: PORTAL_TIMINGS.readyMs }),
    ]);
  } catch {
    return { permitId: null, error: "New Application popup did not open" };
  }

  try {
    await popupPage.waitForLoadState("domcontentloaded");
  } catch {
    // Popup may already be stable before the wait begins.
  }
  await settlePortalUi();

  log("CREATE", "clicking Continue");
  if (!(await clickInFrames(popupPage, sel.continueBtn))) {
    return {
      permitId: null,
      error: "Continue button not found in popup",
    };
  }

  if (options.flow === "existing-company" || options.copyFromApp) {
    log("CREATE", "setting re-application");
    const found = await findInFrames(
      popupPage,
      sel.reapplicationCheckbox,
    );
    if (!found) {
      return {
        permitId: null,
        error: "Re-application checkbox not found",
      };
    }

    if (!(await found.locator.isChecked())) {
      await found.locator.click({ force: true });
      await settlePortalUi();
    }

    if (options.copyFromApp) {
      log("CREATE", "selecting copy-from", options.copyFromApp);
      const selectFound = await findInFrames(
        popupPage,
        sel.copyFromSelect,
      );
      if (!selectFound) {
        return { permitId: null, error: "Copy-from dropdown not found" };
      }

      const value = await selectFound.locator.evaluate(
        (el, needle) => {
          const select = el as HTMLSelectElement;
          for (const opt of select.options) {
            if (
              (opt.textContent ?? "")
                .toLowerCase()
                .includes(String(needle).toLowerCase())
            )
              return opt.value;
          }
          return null;
        },
        options.copyFromApp,
      );
      if (!value) {
        return {
          permitId: null,
          error: `No option matching "${options.copyFromApp}"`,
        };
      }

      await selectFound.locator.selectOption(value);
      await settlePortalUi();
    }
  }

  if (options.flow === "existing-company" && options.companyName) {
    log("CREATE", "selecting company", options.companyName);
    if (!(await selectCompany(popupPage, options.companyName))) {
      log("CREATE", "company not found, falling back to new company");
      if (!(await checkNewCompany(popupPage))) {
        return { permitId: null, error: "Could not select company" };
      }
    }
  } else {
    log("CREATE", "selecting new company");
    if (!(await checkNewCompany(popupPage))) {
      return { permitId: null, error: "Could not check new company" };
    }
  }

  log("CREATE", "clicking Create");
  if (!(await clickInFrames(popupPage, sel.createBtn))) {
    return { permitId: null, error: "Create button not found" };
  }

  log("CREATE", "waiting for application ID");
  const permitId = await pollUntil(
    async () => {
      try {
        const raw = await page
          .locator(sel.applicationId)
          .first()
          .textContent();
        const val = raw?.trim() ?? "";
        return /^D\d{7}$/i.test(val) ? val.toUpperCase() : null;
      } catch {
        return null;
      }
    },
    {
      timeoutMs: PORTAL_TIMINGS.operationMs,
      isDone: (id) => id !== null,
    },
  );

  log(
    "CREATE",
    permitId ? `SUCCESS → ${permitId}` : "FAIL: timed out waiting for ID",
  );
  return permitId
    ? { permitId }
    : { permitId: null, error: "Timed out waiting for application ID" };
};

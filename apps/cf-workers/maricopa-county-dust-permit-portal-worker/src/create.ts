import type { Page } from "playwright";

import {
  type PortalContext,
  PORTAL_TIMINGS,
  hasSelector,
  isVisible,
  pollUntil,
  settlePortalUi,
  waitForVisible,
} from "./portal-shared";

/**
 * Maricopa portal creation flow and the shared browser automation used by both
 * the worker handler and the local headed Playwright specs.
 */

interface RuntimeOption {
  textContent?: string | null;
  value?: string;
}

interface RuntimeSelectNode {
  options?: Iterable<RuntimeOption> & ArrayLike<RuntimeOption>;
}

interface RuntimeTextContainer {
  textContent?: string | null;
}

interface RuntimeRadioNode {
  closest?: (selector: string) => RuntimeTextContainer | null;
}

interface RuntimeClickableNode {
  click?: () => void;
}

const DUST_PERMIT_BASE_URL = "https://dm.maricopa.gov/";

const selectors = {
  applicationIdField: '[id="ThePage:applicationId"]',
  companyRadioButtons: 'input[name="RadioButtons"]',
  continueButton: 'img[alt="Continue"]',
  copyFromSelect: '[id="newDustApplcation:_idJsp24"]',
  createButton:
    '[id="newDustApplcation:createNewApplication"], a:has(img[alt="Create"]), img[alt="Create"]',
  disclaimerAgreeBtn: '[onclick*="agree"]',
  draftSection: "text=Draft Dust Applications",
  loginButtons: [
    'a[id*="loginBtn"]',
    'a:has(img[alt="Login"])',
    'input[type="submit"][value="Login"]',
    'input[type="submit"]',
  ],
  loginPasswordInputs: ['input[id*="password"]', 'input[type="password"]'],
  loginUserInputs: ['input[id*="userName"]', 'input[type="text"]'],
  logoutLink: 'a:has-text("Logout")',
  myDustAppsLink: "text=My Dust Control Applications",
  newApplicationButton: 'img[alt="New Application"]',
  newCompanyCheckbox: '[id="newDustApplcation:newCompany"]',
  page1ApplicantInfo: "text=Applicant Information",
  page1EmailMarker:
    "text=Provide an email address where we can send the permit",
  reapplicationCheckbox: '[id="newDustApplcation:copyApplication"]',
  showAllCompaniesDropdown:
    '[id="newDustApplcation:assoicatedCompanies-nb__xc_c"]',
  welcomeText: "text=Welcome,",
} as const;

export interface CreateFlow {
  flow: "new-company" | "existing-company";
  copyFromApp?: string;
  companyName?: string;
}

const getContexts = (page: Page): PortalContext[] => {
  const mainFrame = page.mainFrame();
  return [page, ...page.frames().filter((frame) => frame !== mainFrame)];
};

const findContextWithSelector = async (
  page: Page,
  selector: string,
  timeoutMs = PORTAL_TIMINGS.readyMs
): Promise<PortalContext | null> =>
  await pollUntil(
    async () => {
      for (const ctx of getContexts(page)) {
        if (await hasSelector(ctx, selector)) {
          return ctx;
        }
      }

      return null;
    },
    {
      timeoutMs,
      isDone: (ctx) => ctx !== null,
    }
  );

const findContextWithAnySelector = async (
  page: Page,
  selectorList: readonly string[],
  timeoutMs = PORTAL_TIMINGS.readyMs
): Promise<PortalContext | null> =>
  await pollUntil(
    async () => {
      for (const ctx of getContexts(page)) {
        for (const selector of selectorList) {
          if (await hasSelector(ctx, selector)) {
            return ctx;
          }
        }
      }

      return null;
    },
    {
      timeoutMs,
      isDone: (ctx) => ctx !== null,
    }
  );

const clickFirstVisible = async (
  ctx: PortalContext,
  selectorList: readonly string[],
  timeoutMs = PORTAL_TIMINGS.readyMs
): Promise<boolean> => {
  for (const selector of selectorList) {
    try {
      const locator = ctx.locator(selector).first();
      if ((await locator.count()) === 0) {
        continue;
      }

      try {
        await locator.waitFor({ state: "visible", timeout: timeoutMs });
      } catch {
        continue;
      }

      try {
        await locator.scrollIntoViewIfNeeded();
      } catch {
        // Some portal nodes do not support scrolling cleanly.
      }

      for (const click of [
        async () => await locator.click({ timeout: timeoutMs }),
        async () => await locator.click({ force: true, timeout: timeoutMs }),
        async () =>
          await locator.evaluate((node) => {
            const clickable = node as RuntimeClickableNode;
            clickable.click?.();
          }),
      ]) {
        try {
          await click();
          await settlePortalUi();
          return true;
        } catch {
          // Try a stronger click strategy against the same node.
        }
      }
    } catch {
      // Try the next selector variant.
    }
  }

  return false;
};

const fillFirstVisible = async (
  ctx: PortalContext,
  selectorList: readonly string[],
  value: string,
  timeoutMs = PORTAL_TIMINGS.readyMs
): Promise<boolean> => {
  for (const selector of selectorList) {
    try {
      const locator = ctx.locator(selector).first();
      if ((await locator.count()) === 0) {
        continue;
      }
      await locator.fill(value, { timeout: timeoutMs });
      await settlePortalUi();
      return true;
    } catch {
      // Try the next selector variant.
    }
  }

  return false;
};

const readFirstInputValue = async (
  ctx: PortalContext,
  selectorList: readonly string[]
): Promise<string | null> => {
  for (const selector of selectorList) {
    try {
      const locator = ctx.locator(selector).first();
      if ((await locator.count()) === 0) {
        continue;
      }
      return await locator.inputValue();
    } catch {
      // Try the next selector variant.
    }
  }

  return null;
};

const setCheckboxState = async (
  ctx: PortalContext,
  selector: string,
  checked: boolean
): Promise<boolean> => {
  try {
    const locator = ctx.locator(selector).first();
    await locator.waitFor({
      state: "visible",
      timeout: PORTAL_TIMINGS.readyMs,
    });

    const current = await locator.isChecked();
    if (current !== checked) {
      await locator.click({ force: true });
      await settlePortalUi();
    }

    return true;
  } catch {
    return false;
  }
};

const selectOptionByPartialLabel = async (
  ctx: PortalContext,
  selector: string,
  partialLabel: string
): Promise<boolean> => {
  try {
    const locator = ctx.locator(selector).first();
    await locator.waitFor({
      state: "visible",
      timeout: PORTAL_TIMINGS.readyMs,
    });

    const optionValue = await locator.evaluate((node, needle) => {
      const select = node as RuntimeSelectNode;
      const target = String(needle).toLowerCase();

      for (const option of select.options ??
        ([] as Iterable<RuntimeOption> & ArrayLike<RuntimeOption>)) {
        if ((option.textContent ?? "").toLowerCase().includes(target)) {
          return option.value ?? null;
        }
      }

      return null;
    }, partialLabel);

    if (!optionValue) {
      return false;
    }

    await locator.selectOption(optionValue);
    await settlePortalUi();
    return true;
  } catch {
    return false;
  }
};

const clickInAnyContext = async (
  page: Page,
  selectorList: readonly string[]
): Promise<boolean> => {
  for (const selector of selectorList) {
    const ctx = await findContextWithSelector(
      page,
      selector,
      PORTAL_TIMINGS.readyMs
    );
    if (!ctx) {
      continue;
    }
    if (await clickFirstVisible(ctx, [selector])) {
      return true;
    }
  }

  return false;
};

const waitForLoginSuccess = async (
  page: Page,
  timeoutMs = PORTAL_TIMINGS.operationMs
): Promise<boolean> =>
  Boolean(
    await pollUntil(
      async () =>
        (await isVisible(page, selectors.myDustAppsLink)) ||
        (await isVisible(page, selectors.welcomeText)) ||
        (await isVisible(page, selectors.logoutLink)) ||
        (await isVisible(page, selectors.newApplicationButton)),
      {
        timeoutMs,
        isDone: Boolean,
      }
    )
  );

const handleDisclaimer = async (page: Page): Promise<boolean> => {
  if (!page.url().includes("disclaimer")) {
    return true;
  }

  try {
    await page.locator(selectors.disclaimerAgreeBtn).first().click();
    await page.waitForURL((url) => !url.href.includes("disclaimer"), {
      timeout: PORTAL_TIMINGS.readyMs,
    });
    return true;
  } catch {
    return !page.url().includes("disclaimer");
  }
};

const findLoginContext = (page: Page): Promise<PortalContext | null> =>
  findContextWithAnySelector(
    page,
    selectors.loginPasswordInputs,
    PORTAL_TIMINGS.readyMs
  );

const selectCompanyByName = async (
  popupPage: Page,
  companyName: string
): Promise<boolean> => {
  const showAllContext = await findContextWithSelector(
    popupPage,
    selectors.showAllCompaniesDropdown,
    PORTAL_TIMINGS.readyMs
  );
  if (showAllContext) {
    try {
      await showAllContext
        .locator(selectors.showAllCompaniesDropdown)
        .first()
        .selectOption("all");
      await settlePortalUi();
    } catch {
      // Some portal states do not expose the dropdown immediately.
    }
  }

  const radioContext = await findContextWithSelector(
    popupPage,
    selectors.companyRadioButtons,
    PORTAL_TIMINGS.readyMs
  );
  if (!radioContext) {
    return false;
  }

  const radios = radioContext.locator(selectors.companyRadioButtons);
  const radioCount = await radios.count();
  const target = companyName.toLowerCase();

  for (let index = 0; index < radioCount; index += 1) {
    const radio = radios.nth(index);
    const rowText = await radio.evaluate((node) => {
      const runtimeNode = node as RuntimeRadioNode;
      return runtimeNode.closest?.("tr")?.textContent ?? "";
    });

    if (!rowText.toLowerCase().includes(target)) {
      continue;
    }

    try {
      await radio.check({ force: true });
    } catch {
      await radio.click({ force: true });
    }
    await settlePortalUi();
    return true;
  }

  return false;
};

const selectNewCompany = async (popupPage: Page): Promise<boolean> => {
  const ctx = await findContextWithSelector(
    popupPage,
    selectors.newCompanyCheckbox
  );
  if (!ctx) {
    return false;
  }

  return await setCheckboxState(ctx, selectors.newCompanyCheckbox, true);
};

const getApplicationId = async (page: Page): Promise<string | null> => {
  try {
    const raw = await page
      .locator(selectors.applicationIdField)
      .first()
      .textContent();

    const value = raw?.trim() ?? "";
    return /^D\d{7}$/i.test(value) ? value.toUpperCase() : null;
  } catch {
    return null;
  }
};

const waitForApplicationCreated = async (
  page: Page
): Promise<string | null> =>
  await pollUntil(
    async () => {
      const permitId = await getApplicationId(page);
      if (permitId) {
        return permitId;
      }

      const hasApplicationMarkers =
        (await isVisible(page, selectors.page1ApplicantInfo)) ||
        (await isVisible(page, selectors.page1EmailMarker));
      if (!hasApplicationMarkers) {
        return null;
      }

      return await getApplicationId(page);
    },
    {
      timeoutMs: PORTAL_TIMINGS.operationMs,
      isDone: (permitId) => permitId !== null,
    }
  );

export const ensureLoggedIn = async (
  page: Page,
  username: string,
  password: string
): Promise<boolean> => {
  console.log("[LOGIN] checking if already logged in...");
  if (await waitForLoginSuccess(page, PORTAL_TIMINGS.quickMs)) {
    console.log("[LOGIN] already logged in");
    return true;
  }

  console.log("[LOGIN] navigating to portal...");
  await page.goto(DUST_PERMIT_BASE_URL, {
    timeout: PORTAL_TIMINGS.sessionMs,
    waitUntil: "load",
  });
  console.log("[LOGIN] page loaded, url:", page.url());

  if (!(await handleDisclaimer(page))) {
    console.log("[LOGIN] FAIL: disclaimer");
    return false;
  }
  console.log("[LOGIN] disclaimer passed, url:", page.url());

  if (await waitForLoginSuccess(page, PORTAL_TIMINGS.quickMs)) {
    console.log("[LOGIN] already logged in after disclaimer");
    return true;
  }

  console.log("[LOGIN] finding login context...");
  const loginCtx = await findLoginContext(page);
  if (!loginCtx) {
    console.log("[LOGIN] FAIL: no login context found");
    return false;
  }

  console.log("[LOGIN] found login context, filling credentials...");
  const userOk = await fillFirstVisible(
    loginCtx,
    selectors.loginUserInputs,
    username
  );
  const passwordOk = await fillFirstVisible(
    loginCtx,
    selectors.loginPasswordInputs,
    password
  );

  if (!(userOk && passwordOk)) {
    console.log("[LOGIN] FAIL: could not fill credentials");
    return false;
  }

  const userValue =
    (await readFirstInputValue(loginCtx, selectors.loginUserInputs)) ?? "";
  const passwordValue =
    (await readFirstInputValue(loginCtx, selectors.loginPasswordInputs)) ?? "";
  if (!(userValue.trim() && passwordValue.trim())) {
    console.log("[LOGIN] FAIL: credentials did not populate");
    return false;
  }

  console.log("[LOGIN] credentials filled, clicking login...");
  if (!(await clickFirstVisible(loginCtx, selectors.loginButtons))) {
    const successAfterFailedClick = await waitForLoginSuccess(
      page,
      PORTAL_TIMINGS.quickMs
    );
    console.log(
      "[LOGIN]",
      successAfterFailedClick
        ? "click reported failure but login already succeeded"
        : "FAIL: could not click login button"
    );
    return successAfterFailedClick;
  }

  console.log("[LOGIN] waiting for login success...");
  const success = await waitForLoginSuccess(page);
  console.log(
    "[LOGIN]",
    success ? "SUCCESS" : "FAIL: timed out waiting for success indicators"
  );
  return success;
};

export const openMyDustApps = async (page: Page): Promise<boolean> => {
  const isOnDustAppsPage = async (): Promise<boolean> =>
    page.url().includes("/applications/dustApplications.jsf") ||
    (await isVisible(page, selectors.newApplicationButton)) ||
    (await isVisible(page, selectors.draftSection));

  if (await isOnDustAppsPage()) {
    return true;
  }

  const navLink = page.locator(selectors.myDustAppsLink).first();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (attempt === 1) {
        await navLink.click({
          noWaitAfter: true,
          timeout: PORTAL_TIMINGS.readyMs,
        });
      } else if (attempt === 2) {
        await navLink.click({
          force: true,
          noWaitAfter: true,
          timeout: PORTAL_TIMINGS.readyMs,
        });
      } else {
        await navLink.evaluate((node) => {
          const clickable = node as RuntimeClickableNode;
          clickable.click?.();
        });
      }

      const ready = await pollUntil(isOnDustAppsPage, {
        timeoutMs: PORTAL_TIMINGS.readyMs,
        isDone: Boolean,
      });
      if (ready) {
        await settlePortalUi();
        return true;
      }
    } catch {
      // Retry with a stronger click strategy.
    }

    await settlePortalUi();
  }

  return false;
};

export const runMinimalCreate = async (
  page: Page,
  options: CreateFlow
): Promise<{ permitId: string | null; error?: string }> => {
  if (!(await openMyDustApps(page))) {
    return { error: "Could not open My Dust Apps list", permitId: null };
  }

  if (
    !(await waitForVisible(
      page,
      selectors.newApplicationButton,
      PORTAL_TIMINGS.readyMs
    ))
  ) {
    return { error: "New Application button missing", permitId: null };
  }

  let popupPage: Page;
  try {
    [popupPage] = await Promise.all([
      page.context().waitForEvent("page", {
        timeout: PORTAL_TIMINGS.readyMs,
      }),
      page.locator(selectors.newApplicationButton).first().click({
        timeout: PORTAL_TIMINGS.readyMs,
      }),
    ]);
  } catch {
    return { error: "Could not click New Application", permitId: null };
  }

  try {
    await popupPage.waitForLoadState("domcontentloaded");
  } catch {
    // The popup is sometimes already stable before the wait begins.
  }
  await settlePortalUi();

  if (!(await clickInAnyContext(popupPage, [selectors.continueButton]))) {
    return { error: "Failed to click Continue in popup", permitId: null };
  }

  const usingCopy =
    options.flow === "existing-company" || Boolean(options.copyFromApp);
  if (usingCopy) {
    const reapplicationContext = await findContextWithSelector(
      popupPage,
      selectors.reapplicationCheckbox
    );
    if (
      !reapplicationContext ||
      !(await setCheckboxState(
        reapplicationContext,
        selectors.reapplicationCheckbox,
        true
      ))
    ) {
      return { error: "Failed to check re-application", permitId: null };
    }

    if (options.copyFromApp) {
      const dropdownContext = await findContextWithSelector(
        popupPage,
        selectors.copyFromSelect
      );
      if (
        !dropdownContext ||
        !(await selectOptionByPartialLabel(
          dropdownContext,
          selectors.copyFromSelect,
          options.copyFromApp
        ))
      ) {
        return {
          error: `Could not select copy-from app "${options.copyFromApp}"`,
          permitId: null,
        };
      }
    }
  }

  if (options.flow === "existing-company" && options.companyName) {
    const foundCompany = await selectCompanyByName(
      popupPage,
      options.companyName
    );
    if (!foundCompany && !(await selectNewCompany(popupPage))) {
      return { error: "Could not select company in popup", permitId: null };
    }
  } else if (!(await selectNewCompany(popupPage))) {
    return { error: "Could not select new company option", permitId: null };
  }

  if (!(await clickInAnyContext(popupPage, [selectors.createButton]))) {
    return { error: "Could not click Create", permitId: null };
  }

  const permitId = await waitForApplicationCreated(page);
  if (!permitId) {
    return {
      error: "Create timed out before application id became available",
      permitId: null,
    };
  }

  return { permitId };
};

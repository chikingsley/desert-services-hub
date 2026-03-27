import { launch } from "@cloudflare/puppeteer";

interface RuntimeDomNode {
  checked?: boolean;
  click?: () => void;
  closest?: (selector: string) => RuntimeDomNode | null;
  dispatchEvent?: (event: RuntimeDomEvent) => void;
  options?: ArrayLike<RuntimeDomOption>;
  outerHTML?: string;
  parentElement?: RuntimeDomNode | null;
  textContent?: string | null;
  value?: string;
}

type RuntimeDomNodeWithOptions = RuntimeDomNode & {
  options: readonly RuntimeDomOption[];
};

interface RuntimeDomOption {
  textContent?: string | null;
  value: string;
}

interface RuntimeDomEvent {
  bubbles?: boolean;
  type: string;
}

declare const document: {
  body?: {
    textContent?: string | null;
  };
  querySelector: (selector: string) => RuntimeDomNode | null;
  querySelectorAll: (selector: string) => RuntimeDomNode[];
};

const DUST_PERMIT_BASE_URL = "https://dm.maricopa.gov/";
const DUST_PERMIT_LOGIN_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const CREATE_TIMEOUT_MS = 30_000;

const selectors = {
  applicationIdField: '[id="ThePage:applicationId"]',
  continueButton: 'img[alt="Continue"]',
  copyFromSelect: '[id="newDustApplcation:_idJsp24"]',
  createButton: '[id="newDustApplcation:createNewApplication"], [alt="Create"]',
  disclaimerAgreeBtn: '[onclick*="agree"]',
  loginButton:
    'a[id*="loginBtn"], input[type="submit"][value="Login"], input[type="submit"]',
  /** Match the login form in the main document or an iframe (same as dust-permits portal). */
  loginPasswordInput: 'input[id*="password"], input[type="password"]',
  loginUserInput: 'input[id*="userName"], input[type="text"]',
  newApplicationButton: 'img[alt="New Application"]',
  newCompanyCheckbox: '[id="newDustApplcation:newCompany"]',
  reapplicationCheckbox: '[id="newDustApplcation:copyApplication"]',
  showAllCompaniesDropdown:
    '[id="newDustApplcation:assoicatedCompanies-nb__xc_c"]',
};

interface PortalEnv {
  BROWSER: unknown;
  DUST_PERMIT_USERNAME?: string;
  DUST_PERMIT_PASSWORD?: string;
}

interface CreateFlow {
  flow: "new-company" | "existing-company";
  copyFromApp?: string;
  companyName?: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createDomEvent = (type: string): RuntimeDomEvent => ({
  bubbles: true,
  type,
});

const toRuntimeDomArray = <T>(
  value: readonly T[] | ArrayLike<T> | undefined
): T[] => (value ? [...value] : []);

const readJson = async (
  request: Request
): Promise<Record<string, unknown> | null> => {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const getString = (
  body: Record<string, unknown> | null,
  key: string
): string | null => {
  if (!body) {
    return null;
  }

  const value = body[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

const getFlow = (flowValue: string | null): CreateFlow["flow"] | null =>
  flowValue === "existing-company" || flowValue === "new-company"
    ? flowValue
    : null;

type PuppeteerBrowser = Awaited<ReturnType<typeof launch>>;
type PuppeteerPage = Awaited<ReturnType<PuppeteerBrowser["newPage"]>>;
type PuppeteerFrame = ReturnType<PuppeteerPage["mainFrame"]>;

const toPuppeteerContext = (
  page: PuppeteerPage
): PuppeteerPage | PuppeteerFrame => page;

const getAllContexts = (
  page: PuppeteerPage
): (PuppeteerPage | PuppeteerFrame)[] => {
  const mainFrame = page.mainFrame();
  const frames = page.frames();
  return [
    toPuppeteerContext(page),
    ...frames.filter((frame) => frame !== mainFrame),
  ];
};

const firstContextWithSelector = async (
  page: PuppeteerPage,
  selector: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<PuppeteerPage | PuppeteerFrame | null> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const contexts = getAllContexts(page);
    for (const context of contexts) {
      const found = await context.$(selector);
      if (found) {
        return context;
      }
    }
    await sleep(250);
  }
  return null;
};

const waitForText = async (
  page: PuppeteerPage,
  predicate: string,
  timeoutMs = CREATE_TIMEOUT_MS
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  const target = predicate.toLowerCase();

  while (Date.now() < deadline) {
    const found = await page.evaluate((needle) => {
      const bodyText = (document.body?.textContent ?? "").toLowerCase();
      const hasAnchor = [...document.querySelectorAll("a")].some(
        (anchor) => (anchor.textContent ?? "").toLowerCase() === needle
      );
      return bodyText.includes(needle) || hasAnchor;
    }, target);

    if (found) {
      return true;
    }
    await sleep(250);
  }

  return false;
};

const clickBestEffort = async (
  page: PuppeteerPage,
  selectorsToTry: string[]
): Promise<boolean> => {
  for (const selector of selectorsToTry) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector);
      return true;
    } catch {
      // Not every selector variant exists on every page state.
    }
  }

  try {
    const clicked = await page.evaluate((selectorList) => {
      const selectorCandidates = selectorList as string[];
      const nodes = document.querySelectorAll(
        "a, button, input[type='submit'], input[type='button']"
      );
      for (const selector of selectorCandidates) {
        const element = document.querySelector(selector);
        if (element) {
          element.click?.();
          return true;
        }
      }
      const match = nodes.find((node) =>
        selectorCandidates.some((selector) =>
          (node.outerHTML ?? "").includes(selector)
        )
      );
      if (match) {
        match.click?.();
        return true;
      }
      return false;
    }, selectorsToTry);

    return Boolean(clicked);
  } catch {
    return false;
  }
};

const handleDisclaimer = async (page: PuppeteerPage): Promise<boolean> => {
  if (!page.url().includes("disclaimer")) {
    return true;
  }

  const clicked = await clickBestEffort(page, [selectors.disclaimerAgreeBtn]);
  if (!clicked) {
    return false;
  }

  await sleep(300);
  return true;
};

const _fillText = async (
  page: PuppeteerPage,
  selector: string,
  value: string
): Promise<boolean> => {
  const context = await firstContextWithSelector(page, selector);
  if (!context) {
    return false;
  }

  try {
    await context.$eval(
      selector,
      (el, nextValue) => {
        if (!el) {
          return;
        }
        el.value = nextValue;
        el.dispatchEvent?.(createDomEvent("input"));
        el.dispatchEvent?.(createDomEvent("change"));
      },
      value
    );
    return true;
  } catch {
    return false;
  }
};

const clickInFrames = async (
  page: PuppeteerPage,
  selector: string
): Promise<boolean> => {
  const context = await firstContextWithSelector(page, selector, 12_000);
  if (!context) {
    return false;
  }

  try {
    await context.evaluate((sel) => {
      const node = document.querySelector(sel);
      if (!node) {
        return;
      }
      node.click?.();
    }, selector);
    return true;
  } catch {
    return false;
  }
};

const setCheckboxInFrames = async (
  page: PuppeteerPage,
  selector: string,
  checked: boolean
): Promise<boolean> => {
  const context = await firstContextWithSelector(page, selector);
  if (!context) {
    return false;
  }

  try {
    await context.$eval(
      selector,
      (el, target) => {
        if (!el) {
          return;
        }
        el.checked = Boolean(target);
        el.dispatchEvent?.(createDomEvent("change"));
      },
      checked
    );
    return true;
  } catch {
    return false;
  }
};

const pickOptionInFrames = async (
  page: PuppeteerPage,
  selector: string,
  text: string
): Promise<boolean> => {
  const context = await firstContextWithSelector(page, selector);
  if (!context) {
    return false;
  }

  const optionNode = await context.$(selector);
  if (!optionNode) {
    return false;
  }

  const selected = await optionNode.evaluate((node, needle) => {
    const select = node as unknown as RuntimeDomNodeWithOptions;
    if (!select.options?.length) {
      return false;
    }

    const target = String(needle).toLowerCase();
    const option = toRuntimeDomArray(select.options).find((candidate) =>
      (candidate.textContent ?? "").toLowerCase().includes(target)
    );
    if (!option) {
      return false;
    }

    select.value = option.value;
    select.dispatchEvent?.({ bubbles: true, type: "change" });
    return true;
  }, text);

  return Boolean(selected);
};

const selectNewCompany = async (popup: PuppeteerPage): Promise<boolean> => {
  await sleep(250);
  return setCheckboxInFrames(popup, selectors.newCompanyCheckbox, true);
};

const selectCompanyByName = async (
  popup: PuppeteerPage,
  companyName: string
): Promise<boolean> => {
  const context = await firstContextWithSelector(
    popup,
    selectors.showAllCompaniesDropdown,
    8000
  );
  if (!context) {
    return false;
  }

  await context.$eval(
    selectors.showAllCompaniesDropdown,
    (sel) => {
      const select = document.querySelector(sel);
      if (select) {
        select.value = "all";
        select.dispatchEvent?.(createDomEvent("change"));
      }
    },
    selectors.showAllCompaniesDropdown
  );

  await sleep(250);

  const found = await popup.evaluate((name) => {
    const radios = [...document.querySelectorAll('input[name="RadioButtons"]')];
    const target = String(name).toLowerCase();
    for (const radio of radios) {
      const rowText = (radio.closest?.("tr")?.textContent ?? "").toLowerCase();
      if (!target || !rowText.includes(target)) {
        continue;
      }
      radio.checked = true;
      radio.dispatchEvent?.(createDomEvent("change"));
      return true;
    }
    return false;
  }, companyName);

  return found;
};

const getApplicationId = async (
  page: PuppeteerPage
): Promise<string | null> => {
  const raw = await page.evaluate((selector) => {
    const node = document.querySelector(selector);
    return node?.textContent?.trim() ?? null;
  }, selectors.applicationIdField);

  if (!raw || !/^D\d{7}$/i.test(raw)) {
    return null;
  }

  return raw.toUpperCase();
};

const waitForApplicationId = async (
  page: PuppeteerPage
): Promise<string | null> => {
  const deadline = Date.now() + CREATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const appId = await getApplicationId(page);
    if (appId) {
      return appId;
    }
    await sleep(500);
  }
  return null;
};

const fillInContext = async (
  ctx: PuppeteerPage | PuppeteerFrame,
  selector: string,
  value: string
): Promise<boolean> => {
  try {
    await ctx.$eval(
      selector,
      (el, nextValue) => {
        if (!el) {
          return;
        }
        el.value = nextValue;
        el.dispatchEvent?.(createDomEvent("input"));
        el.dispatchEvent?.(createDomEvent("change"));
      },
      value
    );
    return true;
  } catch {
    return false;
  }
};

const findLoginContext = async (
  page: PuppeteerPage
): Promise<PuppeteerPage | PuppeteerFrame | null> => {
  const pwdSelector = selectors.loginPasswordInput;
  const contexts = getAllContexts(page);
  for (const context of contexts) {
    const found = await context.$(pwdSelector);
    if (found) {
      return context;
    }
  }
  return null;
};

const fillLoginCredentialsInContext = async (
  ctx: PuppeteerPage | PuppeteerFrame,
  username: string,
  password: string
): Promise<boolean> => {
  const userSelectors = ['input[id*="userName"]', 'input[type="text"]'];
  let userOk = false;
  for (const sel of userSelectors) {
    userOk = await fillInContext(ctx, sel, username);
    if (userOk) {
      break;
    }
  }
  const passOk =
    (await fillInContext(ctx, 'input[id*="password"]', password)) ||
    (await fillInContext(ctx, 'input[type="password"]', password));
  return userOk && passOk;
};

const credentialsPopulatedInContext = async (
  ctx: PuppeteerPage | PuppeteerFrame
): Promise<boolean> =>
  await ctx.evaluate(() => {
    const emailEl =
      (document.querySelector(
        'input[id*="userName"]'
      ) as RuntimeDomNode | null) ||
      (document.querySelector('input[type="text"]') as RuntimeDomNode | null);
    const passEl =
      (document.querySelector(
        'input[id*="password"]'
      ) as RuntimeDomNode | null) ||
      (document.querySelector(
        'input[type="password"]'
      ) as RuntimeDomNode | null);
    return Boolean(
      (emailEl?.value ?? "").trim() && (passEl?.value ?? "").trim()
    );
  });

const clickLoginInContext = async (
  ctx: PuppeteerPage | PuppeteerFrame
): Promise<boolean> => {
  const simple = [
    'a[id*="loginBtn"]',
    'input[type="submit"][value="Login"]',
    'input[type="submit"]',
  ];
  for (const sel of simple) {
    try {
      const el = await ctx.$(sel);
      if (el) {
        await el.click();
        return true;
      }
    } catch {
      // try next selector
    }
  }
  return await ctx.evaluate(() => {
    const loginAnchor = document.querySelector(
      'a[id*="loginBtn"]'
    ) as RuntimeDomNode | null;
    const anchor = loginAnchor as unknown as { offsetParent?: unknown } | null;
    if (anchor && anchor.offsetParent !== null) {
      loginAnchor?.click?.();
      return true;
    }
    const nodes = [
      ...document.querySelectorAll(
        "input[type=submit], input[type=button], button, a"
      ),
    ];
    const visible = nodes.filter(
      (el) =>
        (el as unknown as { offsetParent?: unknown }).offsetParent !== null
    );
    const match = visible.find((el) => {
      const tag = ((el as { tagName?: string }).tagName ?? "").toLowerCase();
      if (tag === "input") {
        return (
          ((el as RuntimeDomNode).value || "").trim().toLowerCase() === "login"
        );
      }
      return (el.textContent || "").trim().toLowerCase() === "login";
    });
    if (match) {
      (match as RuntimeDomNode).click?.();
      return true;
    }
    return false;
  });
};

const waitForLoginSuccess = async (
  page: PuppeteerPage,
  timeoutMs = 25_000
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await page.evaluate(() => {
      const body = (document.body?.textContent ?? "").toLowerCase();
      if (body.includes("my dust control applications")) {
        return true;
      }
      if (body.includes("welcome,")) {
        return true;
      }
      const anchors = [...document.querySelectorAll("a")];
      const logout = anchors.some(
        (a) => (a.textContent ?? "").trim().toLowerCase() === "logout"
      );
      if (logout) {
        return true;
      }
      return false;
    });
    if (ok) {
      return true;
    }
    await sleep(250);
  }
  return false;
};

const ensureLoggedIn = async (
  page: PuppeteerPage,
  username: string,
  password: string
): Promise<boolean> => {
  const alreadyLoggedIn = await waitForText(
    page,
    "my dust control applications",
    5000
  );
  if (alreadyLoggedIn) {
    return true;
  }

  await page.goto(DUST_PERMIT_BASE_URL, {
    timeout: DUST_PERMIT_LOGIN_TIMEOUT_MS,
    waitUntil: "load",
  });

  if (!(await handleDisclaimer(page))) {
    return false;
  }

  if (await waitForText(page, "my dust control applications", 5000)) {
    return true;
  }

  const loginCtx = await (async () => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const ctx = await findLoginContext(page);
      if (ctx) {
        return ctx;
      }
      await sleep(250);
    }
    return null;
  })();

  if (!loginCtx) {
    return false;
  }

  if (!(await fillLoginCredentialsInContext(loginCtx, username, password))) {
    return false;
  }

  if (!(await credentialsPopulatedInContext(loginCtx))) {
    return false;
  }

  if (!(await clickLoginInContext(loginCtx))) {
    return false;
  }

  await sleep(300);
  return await waitForLoginSuccess(page, 25_000);
};

const openMyDustApps = async (page: PuppeteerPage): Promise<boolean> => {
  if (await waitForText(page, "my dust control applications", 5000)) {
    return true;
  }

  const hasMyDustApps = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a")];
    const link = links.find(
      (item) =>
        (item.textContent ?? "").trim() === "My Dust Control Applications"
    );
    if (!link) {
      return false;
    }
    link.click?.();
    return true;
  });
  if (hasMyDustApps) {
    return await waitForText(page, "new application", 10_000);
  }

  return false;
};

const launchAndLogin = async (
  env: PortalEnv
): Promise<{ browser: PuppeteerBrowser; page: PuppeteerPage }> => {
  const browser = await launch(
    env.BROWSER as unknown as Parameters<typeof launch>[0]
  );
  const page = await browser.newPage();
  page.setDefaultTimeout(DUST_PERMIT_LOGIN_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(DUST_PERMIT_LOGIN_TIMEOUT_MS);

  return { browser, page };
};

const runMinimalCreate = async (
  page: PuppeteerPage,
  options: CreateFlow
): Promise<{ permitId: string | null; error?: string }> => {
  const createFlow = options.flow;
  await page.goto(DUST_PERMIT_BASE_URL, {
    timeout: DUST_PERMIT_LOGIN_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });

  const newAppButtonReady = await firstContextWithSelector(
    page,
    selectors.newApplicationButton,
    5000
  );
  if (!newAppButtonReady) {
    const opened = await openMyDustApps(page);
    if (!opened) {
      return { error: "Could not open My Dust Apps list", permitId: null };
    }
  }

  if (!(await firstContextWithSelector(page, selectors.newApplicationButton))) {
    return { error: "New Application button missing", permitId: null };
  }

  if (!(await clickInFrames(page, selectors.newApplicationButton))) {
    return { error: "Could not click New Application", permitId: null };
  }

  const popupTarget = await page
    .browser()
    .waitForTarget(
      (target) =>
        target.opener() === page.target() &&
        target.type() === "page" &&
        target.url().length > 0,
      { timeout: 15_000 }
    );
  const popupPage = await popupTarget.page();
  if (!popupPage) {
    return { error: "New Application popup did not open", permitId: null };
  }

  await popupPage
    .waitForNavigation({
      timeout: 10_000,
      waitUntil: "domcontentloaded",
    })
    .catch(() => {
      // Popup may already be stable and not navigating.
    });
  await sleep(500);

  if (!(await clickInFrames(popupPage, selectors.continueButton))) {
    return { error: "Failed to click Continue in popup", permitId: null };
  }

  const usingCopy =
    createFlow === "existing-company" || Boolean(options.copyFromApp);
  if (usingCopy) {
    if (
      !(await setCheckboxInFrames(
        popupPage,
        selectors.reapplicationCheckbox,
        true
      ))
    ) {
      return { error: "Failed to check re-application", permitId: null };
    }

    if (
      options.copyFromApp &&
      !(await pickOptionInFrames(
        popupPage,
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

  if (createFlow === "existing-company" && options.companyName) {
    const found = await selectCompanyByName(popupPage, options.companyName);
    if (!found && !(await selectNewCompany(popupPage))) {
      return { error: "Could not select company in popup", permitId: null };
    }
  } else if (!(await selectNewCompany(popupPage))) {
    return { error: "Could not select new company option", permitId: null };
  }

  if (!(await clickInFrames(popupPage, selectors.createButton))) {
    return { error: "Could not click Create", permitId: null };
  }

  await sleep(500);

  if (page.isClosed()) {
    return {
      error: "Main page closed unexpectedly while creating",
      permitId: null,
    };
  }

  const permitId = await waitForApplicationId(page);
  if (!permitId) {
    return {
      error: "Create timed out before application id became available",
      permitId: null,
    };
  }
  return { permitId };
};

export const handleMaricopaCreatePost = async (
  request: Request,
  env: PortalEnv
): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed", success: false },
      { status: 405 }
    );
  }

  if (!env.BROWSER) {
    return Response.json(
      { error: "BROWSER binding is not configured", success: false },
      { status: 500 }
    );
  }

  const username = env.DUST_PERMIT_USERNAME?.trim();
  const password = env.DUST_PERMIT_PASSWORD?.trim();
  if (!username || !password) {
    return Response.json(
      {
        error:
          "Missing DUST_PERMIT_USERNAME and/or DUST_PERMIT_PASSWORD environment variables",
        success: false,
      },
      { status: 400 }
    );
  }

  const body = await readJson(request);
  const flow = getFlow(getString(body, "flow")) ?? "new-company";
  const options: CreateFlow = {
    companyName: getString(body, "companyName") ?? undefined,
    copyFromApp: getString(body, "copyFromApp") ?? undefined,
    flow,
  };

  let browser: PuppeteerBrowser | null = null;
  try {
    const createSession = await launchAndLogin(env);
    ({ browser } = createSession);
    if (!browser) {
      throw new Error("Browser launch returned no browser instance");
    }

    const [page] = await browser.pages();
    if (!page) {
      throw new Error("Browser session did not produce a page");
    }

    const loggedIn = await ensureLoggedIn(page, username, password);
    if (!loggedIn) {
      return Response.json(
        { error: "Login failed", success: false },
        { status: 401 }
      );
    }

    const opened = await openMyDustApps(page);
    if (!opened) {
      return Response.json(
        {
          error: "Could not reach My Dust Apps after login",
          success: false,
        },
        { status: 500 }
      );
    }

    const result = await runMinimalCreate(page, options);
    if (!result.permitId) {
      return Response.json(
        { error: result.error, success: false },
        { status: 422 }
      );
    }

    return Response.json({
      applicationId: result.permitId,
      permitId: result.permitId,
      success: true,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
        success: false,
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {
        // ignore teardown errors
      });
    }
  }
};

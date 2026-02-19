// biome-ignore lint/nursery/noExcessiveLinesPerFile: Playwright fallback runner keeps retries, diagnostics, and selector orchestration in one module.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  PLAYWRIGHT_BUILDINGCONNECTED_EMAIL_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_LOGIN_LINK_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_MENU_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_PASSWORD_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_PRIMARY_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_SUBMIT_SELECTORS,
  PLAYWRIGHT_DROPBOX_MENU_SELECTORS,
  PLAYWRIGHT_DROPBOX_PRIMARY_SELECTORS,
  PLAYWRIGHT_EGNYTE_CLICK_SELECTORS,
  type PlaywrightBodyLinkSource,
} from "./body-link-playwright-selectors";

const INVALID_FILENAME_CHARS_PATTERN = /[/\\?%*:|"<>]/g;
const LEADING_DOTS_PATTERN = /^\.+/;
const PLAYWRIGHT_FALLBACK_ENABLED =
  process.env.EMAIL_BODY_LINK_PLAYWRIGHT !== "0";
const PLAYWRIGHT_HEADLESS =
  process.env.EMAIL_BODY_LINK_PLAYWRIGHT_HEADLESS !== "0";
const DEFAULT_PLAYWRIGHT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const PLAYWRIGHT_USER_AGENT =
  process.env.EMAIL_BODY_LINK_PLAYWRIGHT_USER_AGENT?.trim() ||
  DEFAULT_PLAYWRIGHT_USER_AGENT;
const DEFAULT_PLAYWRIGHT_STORAGE_STATE_PATH =
  "/app/data/attachments/body-links-auth/state.json";
const PLAYWRIGHT_STORAGE_STATE_PATH =
  process.env.EMAIL_BODY_LINK_PLAYWRIGHT_STORAGE_STATE_PATH?.trim() ||
  DEFAULT_PLAYWRIGHT_STORAGE_STATE_PATH;
const BUILDINGCONNECTED_LOGIN_EMAIL = (
  process.env.BUILDINGCONNECTED_LOGIN_EMAIL ??
  process.env.BUILDINGCONNECTED_EMAIL ??
  ""
).trim();
const BUILDINGCONNECTED_LOGIN_PASSWORD = (
  process.env.BUILDINGCONNECTED_LOGIN_PASSWORD ??
  process.env.BUILDINGCONNECTED_PASSWORD ??
  ""
).trim();
const PLAYWRIGHT_TIMEOUT_MS =
  Number.parseInt(process.env.EMAIL_BODY_LINK_PLAYWRIGHT_TIMEOUT_MS ?? "", 10) >
  0
    ? Number.parseInt(
        process.env.EMAIL_BODY_LINK_PLAYWRIGHT_TIMEOUT_MS ?? "",
        10
      )
    : 45_000;
const PLAYWRIGHT_DOWNLOAD_WAIT_MS =
  Number.parseInt(
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_DOWNLOAD_WAIT_MS ?? "",
    10
  ) > 0
    ? Number.parseInt(
        process.env.EMAIL_BODY_LINK_PLAYWRIGHT_DOWNLOAD_WAIT_MS ?? "",
        10
      )
    : 8000;
const PLAYWRIGHT_MAX_ATTEMPTS =
  Number.parseInt(
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_MAX_ATTEMPTS ?? "",
    10
  ) > 0
    ? Number.parseInt(
        process.env.EMAIL_BODY_LINK_PLAYWRIGHT_MAX_ATTEMPTS ?? "",
        10
      )
    : 5;
const PLAYWRIGHT_DEBUG_DIR =
  process.env.EMAIL_BODY_LINK_PLAYWRIGHT_DEBUG_DIR?.trim() ||
  "/app/data/attachments/body-links-debug";
const PLAYWRIGHT_POST_NAV_WAIT_MS = 500;
const PLAYWRIGHT_LOGIN_WAIT_MS = 1000;
const PLAYWRIGHT_LOGIN_SUBMIT_WAIT_MS = 1800;
const PLAYWRIGHT_AUTODESK_EMAIL_SUBMIT_SELECTORS = [
  "#verify_user_btn",
  'button[id="verify_user_btn"]',
  'button:has-text("Next")',
  '[role="button"]:has-text("Next")',
  'button[aria-label*="Next" i]',
] as const;

interface DownloadLike {
  saveAs: (path: string) => Promise<void>;
  suggestedFilename: () => string;
}

interface LocatorLike {
  isVisible: (options?: { timeout?: number }) => Promise<boolean>;
  click: (options?: { force?: boolean }) => Promise<void>;
  fill?: (value: string, options?: { timeout?: number }) => Promise<void>;
  press?: (key: string, options?: { timeout?: number }) => Promise<void>;
}

interface PageLike {
  setDefaultTimeout: (timeout: number) => void;
  goto: (
    url: string,
    options?: { waitUntil?: "domcontentloaded"; timeout?: number }
  ) => Promise<void>;
  waitForEvent: (
    event: "download",
    options?: { timeout?: number }
  ) => Promise<DownloadLike>;
  waitForTimeout: (timeout: number) => Promise<void>;
  waitForLoadState?: (
    state: "domcontentloaded",
    options?: { timeout?: number }
  ) => Promise<void>;
  content: () => Promise<string>;
  title: () => Promise<string>;
  url: () => string;
  screenshot: (options: { path: string; fullPage?: boolean }) => Promise<void>;
  evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T>;
  locator: (selector: string) => {
    first: () => LocatorLike;
  };
}

interface BrowserContextLike {
  addInitScript?: (script: () => void) => Promise<void>;
  newPage: () => Promise<PageLike>;
  storageState: (options?: { path?: string }) => Promise<void>;
}

interface BrowserLike {
  newContext: (options?: {
    acceptDownloads?: boolean;
    viewport?: { width: number; height: number };
    storageState?: string;
  }) => Promise<BrowserContextLike>;
  close: () => Promise<void>;
}

interface AttemptArtifactsMeta {
  attempt: number;
  source: PlaywrightBodyLinkSource;
  url: string;
  finalUrl?: string;
  title?: string;
  error?: string;
  visibleDownloadHints?: string[];
}

interface AuthStepState {
  challenge: string | null;
  emailStepVisible: boolean;
  otpVisible: boolean;
  passwordVisible: boolean;
}

interface BlockingGateSignals {
  bodyText: string;
  hasHcaptcha: boolean;
  hasRecaptcha: boolean;
}

export interface PlaywrightDownloadedFile {
  contentType: string | null;
  name: string;
  size: number;
  storagePath: string;
}

export interface PlaywrightFallbackDownloadInput {
  source: PlaywrightBodyLinkSource;
  url: string;
  destDir: string;
  fallbackFilename: string;
  logPrefix?: string;
}

export interface PlaywrightFallbackDownloadResult {
  file: PlaywrightDownloadedFile | null;
  lastError: string | null;
  nonRetryable: boolean;
}

function sanitizeFilename(name: string): string {
  const clean = name
    .replace(INVALID_FILENAME_CHARS_PATTERN, "_")
    .replace(LEADING_DOTS_PATTERN, "")
    .trim()
    .slice(0, 255);
  return clean.length > 0 ? clean : "file";
}

function ensureExtension(name: string, fallbackFilename: string): string {
  if (name.includes(".")) {
    return name;
  }

  const dot = fallbackFilename.lastIndexOf(".");
  if (dot > 0) {
    return `${name}${fallbackFilename.slice(dot)}`;
  }
  return name;
}

function buildUniquePath(destDir: string, filename: string): string {
  const clean = sanitizeFilename(filename);
  const dot = clean.lastIndexOf(".");
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";

  let candidate = join(destDir, clean);
  let suffix = 1;

  while (existsSync(candidate)) {
    candidate = join(destDir, `${base}-${suffix}${ext}`);
    suffix++;
  }

  return candidate;
}

function buildDebugBaseName(
  source: PlaywrightBodyLinkSource,
  url: string,
  attempt: number
): string {
  let host = "unknown";
  let pathPart = "link";
  try {
    const parsed = new URL(url);
    host = sanitizeFilename(parsed.hostname);
    pathPart =
      sanitizeFilename(
        parsed.pathname.split("/").filter(Boolean).pop() || "link"
      ).slice(0, 64) || "link";
  } catch {
    // Keep defaults.
  }

  return `${source}-${host}-${pathPart}-attempt-${attempt}-${Date.now()}`;
}

async function captureAttemptArtifacts(
  page: PageLike,
  params: AttemptArtifactsMeta
): Promise<void> {
  try {
    await mkdir(PLAYWRIGHT_DEBUG_DIR, { recursive: true });
    const base = buildDebugBaseName(params.source, params.url, params.attempt);
    const screenshotPath = join(PLAYWRIGHT_DEBUG_DIR, `${base}.png`);
    const htmlPath = join(PLAYWRIGHT_DEBUG_DIR, `${base}.html`);
    const metaPath = join(PLAYWRIGHT_DEBUG_DIR, `${base}.json`);

    await page
      .screenshot({ path: screenshotPath, fullPage: true })
      .catch(() => null);
    const html = await page.content().catch(() => "");
    await writeFile(htmlPath, html, "utf8").catch(() => null);
    await writeFile(metaPath, JSON.stringify(params, null, 2), "utf8").catch(
      () => null
    );
  } catch {
    // Non-fatal diagnostics failure.
  }
}

async function detectVisibleDownloadHints(page: PageLike): Promise<string[]> {
  const hints = await page
    .evaluate(() => {
      const out: string[] = [];
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>("button, [role='button'], a")
      );
      for (const node of nodes) {
        const text =
          `${node.innerText || ""} ${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`
            .trim()
            .replace(/\s+/g, " ");
        if (!text) {
          continue;
        }
        if (
          text.toLowerCase().includes("download") &&
          node.offsetParent !== null
        ) {
          out.push(text.slice(0, 160));
        }
      }
      return [...new Set(out)].slice(0, 20);
    })
    .catch(() => []);

  return hints;
}

function includesAny(text: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function classifyPasswordProtectionGate(
  bodyText: string,
  hasCaptcha: boolean
): string | null {
  if (
    !includesAny(bodyText, [
      "this file is password protected",
      "password protected",
    ])
  ) {
    return null;
  }

  return hasCaptcha
    ? "Link is password protected and requires CAPTCHA"
    : "Link is password protected";
}

function classifySignInGate(bodyText: string): string | null {
  if (
    !includesAny(bodyText, [
      "sign in to autodesk",
      "sign in to buildingconnected",
    ])
  ) {
    if (
      includesAny(bodyText, [
        "this browser is not currently supported",
        "unsupported browser",
      ])
    ) {
      return "BuildingConnected sign-in blocked by unsupported browser detection";
    }
    return null;
  }

  if (includesAny(bodyText, ["verify you are human", "prove you are human"])) {
    return "BuildingConnected sign-in requires CAPTCHA verification";
  }

  if (
    includesAny(bodyText, [
      "one-time code",
      "verification code",
      "authenticator",
    ])
  ) {
    return "BuildingConnected OTP required";
  }

  return "BuildingConnected requires authenticated session";
}

async function detectBlockingGate(page: PageLike): Promise<string | null> {
  const signals = await page
    .evaluate(() => {
      const bodyText = document.body?.innerText?.toLowerCase() ?? "";
      return {
        bodyText,
        hasHcaptcha: Boolean(
          document.querySelector("iframe[src*='hcaptcha']") ||
            document.querySelector(".h-captcha") ||
            document.querySelector("[data-hcaptcha-response]") ||
            document.querySelector("textarea[name='h-captcha-response']")
        ),
        hasRecaptcha:
          Boolean(
            document.querySelector("iframe[src*='recaptcha']") ||
              document.querySelector(".g-recaptcha")
          ) || bodyText.includes("captcha"),
      } satisfies BlockingGateSignals;
    })
    .catch(() => null);

  if (!signals) {
    return null;
  }

  const hasCaptcha = signals.hasRecaptcha || signals.hasHcaptcha;
  const passwordGate = classifyPasswordProtectionGate(
    signals.bodyText,
    hasCaptcha
  );
  if (passwordGate) {
    return passwordGate;
  }

  const signInGate = classifySignInGate(signals.bodyText);
  if (signInGate) {
    return signInGate;
  }

  if (hasCaptcha) {
    return "Link requires CAPTCHA";
  }

  return null;
}

function isNonRetryablePlaywrightError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("password protected") ||
    normalized.includes("requires captcha") ||
    normalized.includes("otp required") ||
    normalized.includes("authenticated session")
  );
}

async function waitForDownloadFromClick(
  page: PageLike,
  click: () => Promise<unknown>
): Promise<DownloadLike | null> {
  const downloadPromise = page
    .waitForEvent("download", {
      timeout: PLAYWRIGHT_DOWNLOAD_WAIT_MS,
    })
    .catch(() => null);

  await click().catch(() => null);
  return await downloadPromise;
}

async function clickSelectorForDownload(
  page: PageLike,
  selectors: readonly string[]
): Promise<DownloadLike | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const isVisible = await locator
      .isVisible({ timeout: 1200 })
      .catch(() => false);
    if (!isVisible) {
      continue;
    }

    const download = await waitForDownloadFromClick(page, () =>
      locator.click({ force: true })
    );
    if (download) {
      return download;
    }
  }

  return null;
}

async function clickFirstVisibleSelector(
  page: PageLike,
  selectors: readonly string[]
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const isVisible = await locator
      .isVisible({ timeout: 1200 })
      .catch(() => false);
    if (!isVisible) {
      continue;
    }
    await locator.click({ force: true }).catch(() => null);
    return true;
  }
  return false;
}

async function fillFirstVisibleSelector(
  page: PageLike,
  selectors: readonly string[],
  value: string
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const fillFn = locator.fill;
    if (!fillFn) {
      continue;
    }
    const filled = await fillFn
      .call(locator, value, { timeout: 3000 })
      .catch(() => null);
    if (filled !== null) {
      return true;
    }
  }
  return false;
}

async function detectAuthChallenge(page: PageLike): Promise<string | null> {
  return await page
    .evaluate(() => {
      const bodyText = document.body?.innerText?.toLowerCase() ?? "";
      const hasCaptchaWidget = Boolean(
        document.querySelector("iframe[src*='hcaptcha']") ||
          document.querySelector(".h-captcha") ||
          document.querySelector("[data-hcaptcha-response]") ||
          document.querySelector("textarea[name='h-captcha-response']") ||
          document.querySelector("iframe[src*='recaptcha']") ||
          document.querySelector(".g-recaptcha")
      );

      if (
        bodyText.includes("this browser is not currently supported") ||
        bodyText.includes("unsupported browser")
      ) {
        return "BuildingConnected sign-in blocked by unsupported browser detection";
      }

      if (
        hasCaptchaWidget ||
        bodyText.includes("verify you are human") ||
        bodyText.includes("prove you are human") ||
        bodyText.includes("complete the captcha")
      ) {
        return "BuildingConnected sign-in requires CAPTCHA verification";
      }

      if (
        bodyText.includes("too many attempts") ||
        bodyText.includes("temporarily locked")
      ) {
        return "BuildingConnected sign-in is temporarily rate-limited";
      }

      return null;
    })
    .catch(() => null);
}

async function isAutodeskEmailStepVisible(page: PageLike): Promise<boolean> {
  return await page
    .evaluate(() => {
      const flowClass =
        document.querySelector(".flow-wrapper")?.className ?? "";
      if (flowClass.toLowerCase().includes("email_required")) {
        return true;
      }

      const emailInput = document.querySelector(
        "input#userName[name='email'], input[name='email'], input[type='email']"
      );
      const nextButton = document.querySelector(
        "#verify_user_btn, button[id='verify_user_btn']"
      );
      return Boolean(emailInput && nextButton);
    })
    .catch(() => false);
}

async function isBuildingConnectedLoginStep(page: PageLike): Promise<boolean> {
  return await page
    .evaluate(() => {
      const href = window.location.href.toLowerCase();
      const bodyText = document.body?.innerText?.toLowerCase() ?? "";
      const hasBcLoginCopy =
        bodyText.includes("sign in to your buildingconnected account") ||
        bodyText.includes("log in to reply on buildingconnected");

      const hasEmailInput = Boolean(
        document.querySelector(
          "input[type='email'], input[name='email'], input[name='username']"
        )
      );
      return (
        hasEmailInput &&
        (href.includes("app.buildingconnected.com/login") || hasBcLoginCopy)
      );
    })
    .catch(() => false);
}

async function detectAuthStepState(page: PageLike): Promise<AuthStepState> {
  const [passwordVisible, otpVisible, emailStepVisible, challenge] =
    await Promise.all([
      isAnySelectorVisible(
        page,
        PLAYWRIGHT_BUILDINGCONNECTED_PASSWORD_SELECTORS
      ),
      isAnySelectorVisible(page, PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS),
      isAutodeskEmailStepVisible(page),
      detectAuthChallenge(page),
    ]);

  return {
    challenge,
    emailStepVisible,
    otpVisible,
    passwordVisible,
  };
}

async function submitAutodeskEmailStep(page: PageLike): Promise<void> {
  const clickedAutodeskNext = await clickFirstVisibleSelector(
    page,
    PLAYWRIGHT_AUTODESK_EMAIL_SUBMIT_SELECTORS
  );
  if (!clickedAutodeskNext) {
    await clickFirstVisibleSelector(
      page,
      PLAYWRIGHT_BUILDINGCONNECTED_SUBMIT_SELECTORS
    );
  }

  const emailInput = page
    .locator("#userName, input[name='email'], input[type='email']")
    .first();
  const pressFn = emailInput.press;
  if (pressFn) {
    await pressFn
      .call(emailInput, "Enter", { timeout: 1200 })
      .catch(() => null);
  }
}

async function maybeAuthenticateBuildingConnected(
  page: PageLike,
  logPrefix: string
): Promise<boolean> {
  if (!(BUILDINGCONNECTED_LOGIN_EMAIL && BUILDINGCONNECTED_LOGIN_PASSWORD)) {
    return false;
  }

  await clickFirstVisibleSelector(
    page,
    PLAYWRIGHT_BUILDINGCONNECTED_LOGIN_LINK_SELECTORS
  );
  await page.waitForTimeout(PLAYWRIGHT_LOGIN_WAIT_MS).catch(() => null);

  const emailFilled = await fillFirstVisibleSelector(
    page,
    PLAYWRIGHT_BUILDINGCONNECTED_EMAIL_SELECTORS,
    BUILDINGCONNECTED_LOGIN_EMAIL
  );
  const challengeBeforePassword = await detectAuthChallenge(page);
  if (challengeBeforePassword) {
    console.warn(`${logPrefix} ${challengeBeforePassword}`);
    return false;
  }

  let passwordFilled = await fillFirstVisibleSelector(
    page,
    PLAYWRIGHT_BUILDINGCONNECTED_PASSWORD_SELECTORS,
    BUILDINGCONNECTED_LOGIN_PASSWORD
  );
  let otpVisible = await isAnySelectorVisible(
    page,
    PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS
  );
  for (
    let authHop = 0;
    authHop < 3 && emailFilled && !(passwordFilled || otpVisible);
    authHop++
  ) {
    await fillFirstVisibleSelector(
      page,
      PLAYWRIGHT_BUILDINGCONNECTED_EMAIL_SELECTORS,
      BUILDINGCONNECTED_LOGIN_EMAIL
    );

    await submitAutodeskEmailStep(page);
    await waitForAuthStep(page, 15_000);

    const challengeAfterEmailSubmit = await detectAuthChallenge(page);
    if (challengeAfterEmailSubmit) {
      console.warn(`${logPrefix} ${challengeAfterEmailSubmit}`);
      return false;
    }

    otpVisible = await isAnySelectorVisible(
      page,
      PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS
    );
    if (otpVisible) {
      break;
    }

    passwordFilled = await fillFirstVisibleSelector(
      page,
      PLAYWRIGHT_BUILDINGCONNECTED_PASSWORD_SELECTORS,
      BUILDINGCONNECTED_LOGIN_PASSWORD
    );
  }
  if (!passwordFilled) {
    if (otpVisible) {
      console.warn(
        `${logPrefix} BuildingConnected OTP required; automation needs a saved authenticated storage state`
      );
    }

    const stillOnEmailStep = await isAutodeskEmailStepVisible(page);
    if (stillOnEmailStep) {
      console.warn(
        `${logPrefix} Autodesk sign-in stayed on the email step after submit; manual verification may be required`
      );
    }
    const stillOnBcLoginStep = await isBuildingConnectedLoginStep(page);
    if (stillOnBcLoginStep) {
      console.warn(
        `${logPrefix} BuildingConnected login stayed on the pre-Autodesk step after submit`
      );
    }
    return false;
  }

  const challengeBeforePasswordSubmit = await detectAuthChallenge(page);
  if (challengeBeforePasswordSubmit) {
    console.warn(`${logPrefix} ${challengeBeforePasswordSubmit}`);
    return false;
  }

  otpVisible = await isAnySelectorVisible(
    page,
    PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS
  );
  if (otpVisible) {
    console.warn(
      `${logPrefix} BuildingConnected OTP required; automation needs a saved authenticated storage state`
    );
    return false;
  }

  await clickFirstVisibleSelector(
    page,
    PLAYWRIGHT_BUILDINGCONNECTED_SUBMIT_SELECTORS
  );
  await page
    .waitForLoadState?.("domcontentloaded", { timeout: 15_000 })
    .catch(() => null);
  await page.waitForTimeout(PLAYWRIGHT_LOGIN_SUBMIT_WAIT_MS).catch(() => null);
  console.log(`${logPrefix} BuildingConnected login attempt submitted`);
  return true;
}

async function isAnySelectorVisible(
  page: PageLike,
  selectors: readonly string[]
): Promise<boolean> {
  for (const selector of selectors) {
    const isVisible = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 1200 })
      .catch(() => false);
    if (isVisible) {
      return true;
    }
  }
  return false;
}

async function waitForAuthStep(
  page: PageLike,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await detectAuthStepState(page);
    if (
      state.passwordVisible ||
      state.otpVisible ||
      state.challenge ||
      state.emailStepVisible
    ) {
      return;
    }
    await page.waitForTimeout(350).catch(() => null);
  }
}

async function persistStorageStateIfConfigured(
  context: BrowserContextLike,
  logPrefix: string
): Promise<void> {
  if (!PLAYWRIGHT_STORAGE_STATE_PATH) {
    return;
  }

  try {
    await mkdir(dirname(PLAYWRIGHT_STORAGE_STATE_PATH), { recursive: true });
    await context.storageState({ path: PLAYWRIGHT_STORAGE_STATE_PATH });
    console.log(
      `${logPrefix} persisted storage state: ${PLAYWRIGHT_STORAGE_STATE_PATH}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `${logPrefix} failed to persist storage state ${PLAYWRIGHT_STORAGE_STATE_PATH}: ${message}`
    );
  }
}

async function clickDiscoveredDownloadCandidates(
  page: PageLike
): Promise<DownloadLike | null> {
  const candidateLabels = await detectVisibleDownloadHints(page);
  for (const label of candidateLabels) {
    const safeLabel = label.replaceAll('"', "");
    const selectors = [
      `button:has-text("${safeLabel}")`,
      `[role="button"]:has-text("${safeLabel}")`,
      `a:has-text("${safeLabel}")`,
    ];

    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const isVisible = await locator
        .isVisible({ timeout: 300 })
        .catch(() => false);
      if (!isVisible) {
        continue;
      }

      const download = await waitForDownloadFromClick(page, () =>
        locator.click({ force: true })
      );
      if (download) {
        return download;
      }
    }
  }

  return null;
}

async function triggerPlaywrightDownload(
  page: PageLike,
  source: PlaywrightBodyLinkSource
): Promise<DownloadLike | null> {
  if (source === "egnyte") {
    const first = await clickSelectorForDownload(
      page,
      PLAYWRIGHT_EGNYTE_CLICK_SELECTORS
    );
    return first ?? (await clickDiscoveredDownloadCandidates(page));
  }

  if (source === "dropbox") {
    const primary = await clickSelectorForDownload(
      page,
      PLAYWRIGHT_DROPBOX_PRIMARY_SELECTORS
    );
    if (primary) {
      return primary;
    }

    const menu = await clickSelectorForDownload(
      page,
      PLAYWRIGHT_DROPBOX_MENU_SELECTORS
    );
    return menu ?? (await clickDiscoveredDownloadCandidates(page));
  }

  const primary = await clickSelectorForDownload(
    page,
    PLAYWRIGHT_BUILDINGCONNECTED_PRIMARY_SELECTORS
  );
  if (primary) {
    return primary;
  }

  const menu = await clickSelectorForDownload(
    page,
    PLAYWRIGHT_BUILDINGCONNECTED_MENU_SELECTORS
  );
  return menu ?? (await clickDiscoveredDownloadCandidates(page));
}

async function savePlaywrightDownload(params: {
  download: DownloadLike;
  destDir: string;
  fallbackFilename: string;
}): Promise<PlaywrightDownloadedFile | null> {
  const suggested = params.download.suggestedFilename();
  const filename = ensureExtension(
    sanitizeFilename(suggested || params.fallbackFilename),
    params.fallbackFilename
  );

  const storagePath = buildUniquePath(params.destDir, filename);
  await params.download.saveAs(storagePath);
  const size = Bun.file(storagePath).size;
  if (size <= 0) {
    return null;
  }

  return {
    contentType: null,
    name: basename(storagePath),
    size,
    storagePath,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Attempt flow combines navigation, gate detection, auth refresh, and download capture with diagnostics.
async function runSingleAttempt(
  params: PlaywrightFallbackDownloadInput,
  attempt: number
): Promise<{
  file: PlaywrightDownloadedFile | null;
  meta: AttemptArtifactsMeta;
}> {
  let browser: BrowserLike | null = null;
  let page: PageLike | null = null;
  let context: BrowserContextLike | null = null;
  const meta: AttemptArtifactsMeta = {
    attempt,
    source: params.source,
    url: params.url,
  };

  try {
    const playwright = (await import("playwright")) as {
      chromium: {
        launch: (options?: {
          headless?: boolean;
          args?: string[];
        }) => Promise<BrowserLike>;
      };
    };

    browser = await playwright.chromium.launch({
      headless: PLAYWRIGHT_HEADLESS,
      args: PLAYWRIGHT_HEADLESS
        ? [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-blink-features=AutomationControlled",
          ]
        : ["--disable-blink-features=AutomationControlled"],
    });

    context = await browser.newContext({
      acceptDownloads: true,
      userAgent: PLAYWRIGHT_USER_AGENT,
      viewport: { width: 1600, height: 1200 },
      storageState:
        PLAYWRIGHT_STORAGE_STATE_PATH &&
        existsSync(PLAYWRIGHT_STORAGE_STATE_PATH)
          ? PLAYWRIGHT_STORAGE_STATE_PATH
          : undefined,
    });
    await context
      .addInitScript?.(() => {
        Object.defineProperty(navigator, "webdriver", {
          configurable: true,
          get: () => undefined,
        });
      })
      .catch(() => null);
    page = await context.newPage();
    page.setDefaultTimeout(PLAYWRIGHT_TIMEOUT_MS);

    const initialDownloadPromise = page
      .waitForEvent("download", { timeout: 2500 })
      .catch(() => null);

    await page.goto(params.url, {
      waitUntil: "domcontentloaded",
      timeout: PLAYWRIGHT_TIMEOUT_MS,
    });
    await page.waitForTimeout(PLAYWRIGHT_POST_NAV_WAIT_MS).catch(() => null);

    meta.finalUrl = page.url();
    meta.title = await page.title().catch(() => "");
    meta.visibleDownloadHints = await detectVisibleDownloadHints(page);
    const blockingGate = await detectBlockingGate(page);
    if (blockingGate) {
      meta.error = blockingGate;
      await captureAttemptArtifacts(page, meta);
      return { file: null, meta };
    }

    const initialDownload = await initialDownloadPromise;
    if (!initialDownload && params.source === "buildingconnected") {
      const authSubmitted = await maybeAuthenticateBuildingConnected(
        page,
        params.logPrefix ?? "[email:body-links]"
      );
      if (authSubmitted && context) {
        await persistStorageStateIfConfigured(
          context,
          params.logPrefix ?? "[email:body-links]"
        );
      }
      meta.visibleDownloadHints = await detectVisibleDownloadHints(page);
    }
    const download =
      initialDownload ??
      (await triggerPlaywrightDownload(page, params.source).catch(() => null));
    if (!download) {
      const postClickGate = await detectBlockingGate(page);
      meta.error = postClickGate ?? "No download event captured";
      await captureAttemptArtifacts(page, meta);
      return { file: null, meta };
    }

    const file = await savePlaywrightDownload({
      download,
      destDir: params.destDir,
      fallbackFilename: params.fallbackFilename,
    });
    if (!file) {
      meta.error = "Downloaded file was empty";
      await captureAttemptArtifacts(page, meta);
      return { file: null, meta };
    }

    if (params.source === "buildingconnected" && context) {
      await persistStorageStateIfConfigured(
        context,
        params.logPrefix ?? "[email:body-links]"
      );
    }

    return { file, meta };
  } catch (error) {
    meta.error = error instanceof Error ? error.message : String(error);
    if (page) {
      await captureAttemptArtifacts(page, meta);
    }
    return { file: null, meta };
  } finally {
    try {
      await browser?.close();
    } catch {
      // Non-fatal cleanup.
    }
  }
}

export function isDropboxFolderUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.includes("/fo/") || path.includes("/folders/");
  } catch {
    const lower = url.toLowerCase();
    return lower.includes("/fo/") || lower.includes("/folders/");
  }
}

export async function tryPlaywrightFallbackDownload(
  params: PlaywrightFallbackDownloadInput
): Promise<PlaywrightFallbackDownloadResult> {
  if (!PLAYWRIGHT_FALLBACK_ENABLED) {
    return { file: null, lastError: null, nonRetryable: false };
  }

  const logPrefix = params.logPrefix ?? "[email:body-links]";
  const attempts = Math.max(1, PLAYWRIGHT_MAX_ATTEMPTS);
  let lastError: string | null = null;
  let nonRetryable = false;
  if (
    PLAYWRIGHT_STORAGE_STATE_PATH &&
    !existsSync(PLAYWRIGHT_STORAGE_STATE_PATH)
  ) {
    console.warn(
      `${logPrefix} storage state file not found: ${PLAYWRIGHT_STORAGE_STATE_PATH}`
    );
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { file, meta } = await runSingleAttempt(params, attempt);

    if (file) {
      if (attempt > 1) {
        console.warn(
          `${logPrefix} Playwright fallback succeeded on attempt ${attempt}/${attempts} (${params.source})`
        );
      }
      return { file, lastError: null, nonRetryable: false };
    }

    lastError = meta.error ?? null;
    console.warn(
      `${logPrefix} Playwright attempt ${attempt}/${attempts} failed (${params.source}): ${meta.error ?? "unknown"}`
    );

    if (meta.error && isNonRetryablePlaywrightError(meta.error)) {
      nonRetryable = true;
      console.warn(
        `${logPrefix} stopping retries for ${params.source}; non-retryable gate detected`
      );
      break;
    }
  }

  return { file: null, lastError, nonRetryable };
}

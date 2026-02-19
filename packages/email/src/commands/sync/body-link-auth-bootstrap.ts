// biome-ignore lint/nursery/noExcessiveLinesPerFile: Bootstrap flow keeps auth selectors, prompts, diagnostics, and validation in one command file.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  PLAYWRIGHT_BUILDINGCONNECTED_EMAIL_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_LOGIN_LINK_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_PASSWORD_SELECTORS,
  PLAYWRIGHT_BUILDINGCONNECTED_SUBMIT_SELECTORS,
} from "@email/sync/body-link-playwright-selectors";
import type { Page } from "playwright";
import { chromium } from "playwright";

function getDefaultTimeoutMs(): number {
  const parsed = Number.parseInt(
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_TIMEOUT_MS ?? "",
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45_000;
}

const DEFAULT_PLAYWRIGHT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

function getPlaywrightUserAgent(): string {
  return (
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_USER_AGENT?.trim() ||
    DEFAULT_PLAYWRIGHT_USER_AGENT
  );
}

function getDefaultStatePath(): string {
  return (
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_STORAGE_STATE_PATH?.trim() ||
    "/app/data/attachments/body-links-auth/state.json"
  );
}

function getDefaultUrl(): string {
  return (
    process.env.BUILDINGCONNECTED_LOGIN_START_URL?.trim() ||
    "https://app.buildingconnected.com/"
  );
}

function getDefaultDebugDir(): string {
  return (
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_DEBUG_DIR?.trim() ||
    "/app/data/attachments/body-links-debug"
  );
}

const VNC_RESOLUTION_RE = /^(\d{2,5})x(\d{2,5})$/i;

function parseVncViewport(raw: string | undefined): {
  width: number;
  height: number;
} | null {
  const match = raw?.trim().match(VNC_RESOLUTION_RE);
  if (!match) return null;
  const w = Number.parseInt(match[1], 10);
  const h = Number.parseInt(match[2], 10);
  return w > 0 && h > 0 ? { width: w, height: h } : null;
}

function getViewport(): { width: number; height: number } {
  return (
    parseVncViewport(process.env.VNC_RESOLUTION) ??
    parseVncViewport(process.env.BACKGROUND_JOBS_VNC_RESOLUTION) ?? { width: 1600, height: 1200 }
  );
}

export interface BodyLinkAuthBootstrapOptions {
  debugDir: string;
  email: string;
  headless: boolean;
  manualAuthTimeoutMs: number;
  manualAuthWait: boolean;
  nonInteractive: boolean;
  otp: string | null;
  password: string;
  statePath: string;
  timeoutMs: number;
  url: string;
  validateUrl: string | null;
}

const DEFAULT_MANUAL_AUTH_TIMEOUT_MS = 20 * 60 * 1000;

function getArgValue(args: string[], flag: string): string | undefined {
  const equalsArg = args.find((arg) => arg.startsWith(`--${flag}=`));
  if (equalsArg) {
    return equalsArg.split("=", 2)[1];
  }

  const argIndex = args.indexOf(`--${flag}`);
  const value = args[argIndex + 1];
  if (argIndex === -1 || !value || value.startsWith("--")) {
    return undefined;
  }
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseBodyLinkAuthBootstrapArgs(
  args: string[]
): BodyLinkAuthBootstrapOptions {
  const headlessFromEnv =
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_HEADLESS !== "0";
  const emailFromEnv = (
    process.env.BUILDINGCONNECTED_LOGIN_EMAIL ??
    process.env.BUILDINGCONNECTED_EMAIL ??
    ""
  ).trim();
  const passwordFromEnv = (
    process.env.BUILDINGCONNECTED_LOGIN_PASSWORD ??
    process.env.BUILDINGCONNECTED_PASSWORD ??
    ""
  ).trim();

  const headed = args.includes("--headed");
  const forcedHeadless = args.includes("--headless");
  const nonInteractiveFlag = args.includes("--non-interactive");
  const manualAuthWaitFlag = args.includes("--manual-auth-wait");

  return {
    debugDir: getArgValue(args, "debug-dir")?.trim() || getDefaultDebugDir(),
    email: getArgValue(args, "email")?.trim() || emailFromEnv,
    headless: headed ? false : forcedHeadless || headlessFromEnv,
    manualAuthTimeoutMs: parsePositiveInt(
      getArgValue(args, "manual-timeout-ms"),
      DEFAULT_MANUAL_AUTH_TIMEOUT_MS
    ),
    manualAuthWait: manualAuthWaitFlag,
    nonInteractive:
      nonInteractiveFlag || !(process.stdin.isTTY && process.stdout.isTTY),
    otp: getArgValue(args, "otp")?.trim() || null,
    password: getArgValue(args, "password")?.trim() || passwordFromEnv,
    statePath: getArgValue(args, "state-path")?.trim() || getDefaultStatePath(),
    timeoutMs: parsePositiveInt(
      getArgValue(args, "timeout-ms"),
      getDefaultTimeoutMs()
    ),
    url: getArgValue(args, "url")?.trim() || getDefaultUrl(),
    validateUrl: getArgValue(args, "validate-url")?.trim() || null,
  };
}

function printHelp(): void {
  console.log(`
BuildingConnected Auth Bootstrap

Usage:
  bun packages/email/cli/cli.ts body-link-auth-bootstrap [options]

Options:
  --url <url>             Initial BuildingConnected URL (default: ${getDefaultUrl()})
  --state-path <path>     Storage state output path (default: ${getDefaultStatePath()})
  --email <email>         BuildingConnected login email (env fallback)
  --password <password>   BuildingConnected login password (env fallback)
  --otp <code>            One-time code (optional; prompted if required)
  --validate-url <url>    Test a real goto URL download after auth bootstrap
  --timeout-ms <ms>       Page/action timeout (default: ${getDefaultTimeoutMs()})
  --debug-dir <path>      Debug artifacts path (default: ${getDefaultDebugDir()})
  --manual-auth-wait      Wait for manual CAPTCHA/OTP completion in-browser
  --manual-timeout-ms <ms> Manual auth wait timeout (default: ${DEFAULT_MANUAL_AUTH_TIMEOUT_MS})
  --headless              Force headless mode
  --headed                Force headed mode (requires display in container)
  --non-interactive       Disable prompts; fail if OTP prompt is needed
`);
}

const PLAYWRIGHT_AUTODESK_EMAIL_SUBMIT_SELECTORS = [
  "#verify_user_btn",
  'button[id="verify_user_btn"]',
  'button:has-text("Next")',
  '[role="button"]:has-text("Next")',
  'button[aria-label*="Next" i]',
] as const;

interface AuthStepState {
  challenge: string | null;
  emailStepVisible: boolean;
  otpVisible: boolean;
  passwordVisible: boolean;
}

async function clickFirstVisibleSelector(
  page: Page,
  selectors: readonly string[]
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const visible = await locator
      .isVisible({ timeout: 1200 })
      .catch(() => false);
    if (!visible) {
      continue;
    }
    await locator.click({ force: true }).catch(() => null);
    return true;
  }
  return false;
}

async function fillFirstVisibleSelector(
  page: Page,
  selectors: readonly string[],
  value: string
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const filled = await locator
      .fill(value, { timeout: 3000 })
      .catch(() => null);
    if (filled !== null) {
      return true;
    }
  }
  return false;
}

async function isAnySelectorVisible(
  page: Page,
  selectors: readonly string[]
): Promise<boolean> {
  for (const selector of selectors) {
    const visible = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 1200 })
      .catch(() => false);
    if (visible) {
      return true;
    }
  }
  return false;
}

async function waitForAuthStep(page: Page, timeoutMs: number): Promise<void> {
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

async function detectAuthChallenge(page: Page): Promise<string | null> {
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
        return "Autodesk sign-in blocked by unsupported browser detection";
      }

      if (
        hasCaptchaWidget ||
        bodyText.includes("verify you are human") ||
        bodyText.includes("prove you are human") ||
        bodyText.includes("complete the captcha")
      ) {
        return "Autodesk sign-in requires CAPTCHA/hCaptcha verification";
      }

      if (
        bodyText.includes("too many attempts") ||
        bodyText.includes("temporarily locked")
      ) {
        return "Autodesk sign-in is temporarily rate-limited";
      }

      return null;
    })
    .catch(() => null);
}

async function isAutodeskEmailStepVisible(page: Page): Promise<boolean> {
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

async function isBuildingConnectedLoginStep(page: Page): Promise<boolean> {
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

async function detectAuthStepState(page: Page): Promise<AuthStepState> {
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

async function submitAutodeskEmailStep(page: Page): Promise<void> {
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

  await page
    .locator("#userName, input[name='email'], input[type='email']")
    .first()
    .press("Enter")
    .catch(() => null);
}

async function fillOtpCode(page: Page, otpCode: string): Promise<boolean> {
  const normalized = otpCode.replaceAll(/\s+/g, "");
  if (!normalized) {
    return false;
  }

  const directFilled = await fillFirstVisibleSelector(
    page,
    PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS,
    normalized
  );
  if (directFilled) {
    return true;
  }

  const otpBoxes = page.locator(
    'input[inputmode="numeric"], input[autocomplete="one-time-code"]'
  );
  const boxCount = await otpBoxes.count().catch(() => 0);
  if (boxCount < normalized.length || normalized.length < 2) {
    return false;
  }

  for (const [index, digit] of normalized.split("").entries()) {
    await otpBoxes
      .nth(index)
      .fill(digit, { timeout: 1500 })
      .catch(() => null);
  }
  return true;
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function captureBootstrapArtifacts(
  page: Page,
  debugDir: string
): Promise<void> {
  try {
    await mkdir(debugDir, { recursive: true });
    const stamp = Date.now();
    await page
      .screenshot({
        path: join(debugDir, `body-link-auth-bootstrap-${stamp}.png`),
        fullPage: true,
      })
      .catch(() => null);
    const html = await page.content().catch(() => "");
    await writeFile(
      join(debugDir, `body-link-auth-bootstrap-${stamp}.html`),
      html,
      "utf8"
    ).catch(() => null);
  } catch {
    // Non-fatal diagnostics only.
  }
}

async function isLikelySignedIn(page: Page): Promise<boolean> {
  const hasJoinGate = await page
    .evaluate(() => {
      const body = document.body?.innerText?.toLowerCase() ?? "";
      return (
        body.includes("create an account to reply on buildingconnected") ||
        body.includes("create account to view all files") ||
        body.includes("already have an account?")
      );
    })
    .catch(() => false);
  if (hasJoinGate) {
    return false;
  }

  const hasLoginInputs = await isAnySelectorVisible(page, [
    ...PLAYWRIGHT_BUILDINGCONNECTED_EMAIL_SELECTORS,
    ...PLAYWRIGHT_BUILDINGCONNECTED_PASSWORD_SELECTORS,
  ]);
  if (hasLoginInputs) {
    return false;
  }

  return page.url().toLowerCase().includes("buildingconnected.com");
}

async function waitForManualAuthCompletion(
  page: Page,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLikelySignedIn(page)) {
      return true;
    }
    await page.waitForTimeout(1000).catch(() => null);
  }
  return false;
}

async function maybeHandleManualAuthStep(
  page: Page,
  options: BodyLinkAuthBootstrapOptions,
  reason: string
): Promise<boolean> {
  if (!options.manualAuthWait) {
    return false;
  }

  const timeoutSeconds = Math.round(options.manualAuthTimeoutMs / 1000);
  console.log(
    `[body-link-auth-bootstrap] ${reason}; waiting up to ${timeoutSeconds}s for manual completion`
  );

  const completed = await waitForManualAuthCompletion(
    page,
    options.manualAuthTimeoutMs
  );
  if (completed) {
    return true;
  }

  await captureBootstrapArtifacts(page, options.debugDir);
  throw new Error(
    `${reason}. Timed out waiting for manual completion after ${timeoutSeconds} seconds. Check debug artifacts.`
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Bootstrap flow must handle existing sessions, credential login, OTP, and optional validation in one transaction.
async function runBootstrap(
  options: BodyLinkAuthBootstrapOptions
): Promise<void> {
  if (!(options.email && options.password)) {
    throw new Error(
      "BuildingConnected credentials are required. Set BUILDINGCONNECTED_LOGIN_EMAIL and BUILDINGCONNECTED_LOGIN_PASSWORD (or pass --email/--password)."
    );
  }

  await mkdir(dirname(options.statePath), { recursive: true });

  const isDocker = Boolean(
    process.env.CONTAINER || process.env.DOCKER_CONTAINER
  );
  const viewport = getViewport();

  const browser = await chromium.launch({
    headless: options.headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--start-maximized",
      ...(options.headless || isDocker
        ? ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        : []),
    ],
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      userAgent: getPlaywrightUserAgent(),
      viewport,
      storageState: existsSync(options.statePath)
        ? options.statePath
        : undefined,
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        configurable: true,
        get: () => undefined,
      });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);

    await page.goto(options.url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await page.waitForTimeout(800).catch(() => null);

    if (await isLikelySignedIn(page)) {
      await context.storageState({ path: options.statePath });
      console.log(
        `[body-link-auth-bootstrap] existing session is authenticated; refreshed ${options.statePath}`
      );
    } else {
      await clickFirstVisibleSelector(
        page,
        PLAYWRIGHT_BUILDINGCONNECTED_LOGIN_LINK_SELECTORS
      );
      await page.waitForTimeout(700).catch(() => null);

      const emailFilled = await fillFirstVisibleSelector(
        page,
        PLAYWRIGHT_BUILDINGCONNECTED_EMAIL_SELECTORS,
        options.email
      );
      if (!emailFilled) {
        await captureBootstrapArtifacts(page, options.debugDir);
        throw new Error(
          "Could not find BuildingConnected email field. Check debug artifacts."
        );
      }

      const challengeBeforePassword = await detectAuthChallenge(page);
      if (challengeBeforePassword) {
        const challengeReason = `${challengeBeforePassword}. Manual verification is required before OTP can be entered.`;
        const handledManually = await maybeHandleManualAuthStep(
          page,
          options,
          challengeReason
        );
        if (!handledManually) {
          await captureBootstrapArtifacts(page, options.debugDir);
          throw new Error(challengeReason);
        }
      }

      let passwordFilled = await fillFirstVisibleSelector(
        page,
        PLAYWRIGHT_BUILDINGCONNECTED_PASSWORD_SELECTORS,
        options.password
      );
      let otpVisibleBeforePasswordSubmit = await isAnySelectorVisible(
        page,
        PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS
      );
      for (
        let authHop = 0;
        authHop < 3 && !(passwordFilled || otpVisibleBeforePasswordSubmit);
        authHop++
      ) {
        await fillFirstVisibleSelector(
          page,
          PLAYWRIGHT_BUILDINGCONNECTED_EMAIL_SELECTORS,
          options.email
        );

        await submitAutodeskEmailStep(page);
        await waitForAuthStep(page, Math.min(options.timeoutMs, 20_000));

        const challengeAfterEmailSubmit = await detectAuthChallenge(page);
        if (challengeAfterEmailSubmit) {
          const challengeReason = `${challengeAfterEmailSubmit}. Manual verification is required before OTP can be entered.`;
          const handledManually = await maybeHandleManualAuthStep(
            page,
            options,
            challengeReason
          );
          if (!handledManually) {
            await captureBootstrapArtifacts(page, options.debugDir);
            throw new Error(challengeReason);
          }
        }

        otpVisibleBeforePasswordSubmit = await isAnySelectorVisible(
          page,
          PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS
        );
        if (otpVisibleBeforePasswordSubmit) {
          break;
        }

        passwordFilled = await fillFirstVisibleSelector(
          page,
          PLAYWRIGHT_BUILDINGCONNECTED_PASSWORD_SELECTORS,
          options.password
        );
      }
      const signedInAfterAuthHops = await isLikelySignedIn(page);
      if (
        !(
          passwordFilled ||
          otpVisibleBeforePasswordSubmit ||
          signedInAfterAuthHops
        )
      ) {
        const stuckOnEmailStep = await isAutodeskEmailStepVisible(page);
        const stuckOnBuildingConnectedLogin =
          await isBuildingConnectedLoginStep(page);
        let reason =
          "Could not find BuildingConnected password field. Check debug artifacts.";
        if (stuckOnEmailStep) {
          reason =
            "Autodesk sign-in stayed on the email step after submit. Manual verification may be required; check debug artifacts.";
        } else if (stuckOnBuildingConnectedLogin) {
          reason =
            "BuildingConnected login stayed on the pre-Autodesk login step after submit. Check debug artifacts.";
        }
        const handledManually = await maybeHandleManualAuthStep(
          page,
          options,
          reason
        );
        if (handledManually) {
          passwordFilled = false;
          otpVisibleBeforePasswordSubmit = false;
        } else {
          await captureBootstrapArtifacts(page, options.debugDir);
          throw new Error(reason);
        }
      }
      if (passwordFilled) {
        await clickFirstVisibleSelector(
          page,
          PLAYWRIGHT_BUILDINGCONNECTED_SUBMIT_SELECTORS
        );
        await page
          .waitForLoadState("domcontentloaded", { timeout: options.timeoutMs })
          .catch(() => null);
        await page.waitForTimeout(1200).catch(() => null);
      }

      const challengeAfterPasswordSubmit = await detectAuthChallenge(page);
      if (challengeAfterPasswordSubmit) {
        const challengeReason = `${challengeAfterPasswordSubmit}. Manual verification is required before OTP can be entered.`;
        const handledManually = await maybeHandleManualAuthStep(
          page,
          options,
          challengeReason
        );
        if (!handledManually) {
          await captureBootstrapArtifacts(page, options.debugDir);
          throw new Error(challengeReason);
        }
      }

      const otpVisible = await isAnySelectorVisible(
        page,
        PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS
      );
      if (otpVisible) {
        let otp = options.otp;
        if (!otp) {
          const handledManually = await maybeHandleManualAuthStep(
            page,
            options,
            "BuildingConnected OTP is required."
          );
          if (handledManually) {
            otp = null;
          } else if (options.nonInteractive) {
            await captureBootstrapArtifacts(page, options.debugDir);
            throw new Error(
              "BuildingConnected OTP is required. Re-run with --otp <code> or in interactive mode."
            );
          } else {
            otp = await promptLine("BuildingConnected OTP code: ");
          }
        }

        if (otp) {
          const otpFilled = await fillOtpCode(page, otp);
          if (!otpFilled) {
            await captureBootstrapArtifacts(page, options.debugDir);
            throw new Error(
              "Could not fill OTP input fields. Check debug artifacts."
            );
          }

          await clickFirstVisibleSelector(
            page,
            PLAYWRIGHT_BUILDINGCONNECTED_SUBMIT_SELECTORS
          );
          await page
            .waitForLoadState("domcontentloaded", {
              timeout: options.timeoutMs,
            })
            .catch(() => null);
          await page.waitForTimeout(1200).catch(() => null);
        }
      }

      if (!(await isLikelySignedIn(page))) {
        const handledManually = await maybeHandleManualAuthStep(
          page,
          options,
          "Login did not reach an authenticated BuildingConnected page."
        );
        if (!handledManually) {
          await captureBootstrapArtifacts(page, options.debugDir);
          throw new Error(
            "Login did not reach an authenticated BuildingConnected page. Check debug artifacts."
          );
        }
      }

      await context.storageState({ path: options.statePath });
      console.log(
        `[body-link-auth-bootstrap] saved authenticated storage state: ${options.statePath}`
      );
    }

    if (!options.validateUrl) {
      return;
    }

    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_STORAGE_STATE_PATH =
      options.statePath;
    process.env.BUILDINGCONNECTED_LOGIN_EMAIL = options.email;
    process.env.BUILDINGCONNECTED_LOGIN_PASSWORD = options.password;

    const { tryPlaywrightFallbackDownload } = await import(
      "@email/sync/body-link-playwright-download"
    );

    const validationDir = join(
      dirname(options.statePath),
      "validation-downloads"
    );
    await mkdir(validationDir, { recursive: true });

    const validation = await tryPlaywrightFallbackDownload({
      source: "buildingconnected",
      url: options.validateUrl,
      destDir: validationDir,
      fallbackFilename: "buildingconnected-package",
      logPrefix: "[body-link-auth-bootstrap]",
    });

    if (!validation.file) {
      throw new Error(
        `Validation download failed: ${validation.lastError ?? "unknown error"}`
      );
    }

    console.log(
      `[body-link-auth-bootstrap] validation download OK: ${validation.file.name} (${validation.file.size} bytes) -> ${validation.file.storagePath}`
    );
  } finally {
    await browser.close().catch(() => null);
  }
}

export async function handleBodyLinkAuthBootstrap(
  args: string[]
): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const options = parseBodyLinkAuthBootstrapArgs(args);
  console.log("=".repeat(68));
  console.log("BODY-LINK AUTH BOOTSTRAP");
  console.log("=".repeat(68));
  console.log(`URL: ${options.url}`);
  console.log(`Storage state path: ${options.statePath}`);
  console.log(`Headless: ${options.headless ? "yes" : "no"}`);
  console.log(`Non-interactive: ${options.nonInteractive ? "yes" : "no"}`);
  console.log(`Manual auth wait: ${options.manualAuthWait ? "yes" : "no"}`);
  console.log(
    `Manual auth timeout: ${Math.round(options.manualAuthTimeoutMs / 1000)}s`
  );
  console.log(`Validate URL: ${options.validateUrl ?? "none"}`);
  console.log("=".repeat(68));

  await runBootstrap(options);
}

/**
 * AutoDustPermit Configuration
 *
 * Central configuration for the dust permit automation system.
 * Contains URLs, API keys, and settings for browser automation.
 *
 * @module tests/support/config
 */

/**
 * Main application configuration.
 * URLs, API keys, and settings loaded from environment variables.
 *
 * ## Browser Configuration
 *
 * The `headless` setting controls whether the browser runs with or without a UI.
 * This can be set globally via `config.headless` or per-script via `config.scripts.<name>`.
 *
 * ### Priority Order
 * 1. Environment variable: `HEADLESS` (`true`/`false` override everything)
 * 2. Script-specific: `config.scripts.<name>.headless`
 * 3. Global default: `config.headless`
 *
 * ### Usage
 * ```typescript
 * import { config } from "@/portal/utils/config";
 * import { createBrowser } from "@/portal/utils/browser";
 *
 * // For delete-all.ts script
 * const browserInstance = await createBrowser({
 *   headless: config.scripts.deleteAll.headless ?? config.headless
 * });
 *
 * // For general API server
 * const browserInstance = await createBrowser({
 *   headless: config.headless
 * });
 * ```
 *
 * ### Development vs Production
 * - Development: Set `HEADLESS=false` to force headed browser
 * - Production/CI: Set `HEADLESS=true` in `.env` → all scripts run headless
 * - Unset `HEADLESS`: scripts use per-script defaults; server uses `config.headless`
 */
function parseHeadlessEnv(): boolean | undefined {
  const env = process.env.HEADLESS;
  if (env === "true") {
    return true;
  }
  if (env === "false") {
    return false;
  }
  return undefined;
}
const HEADLESS_OVERRIDE = parseHeadlessEnv();

export const config = {
  // Maricopa County Dust Permit Portal
  dustPermitUrl: "https://dm.maricopa.gov/",
  dustPermitGuide: "https://gis.maricopa.gov/aqd/impact/dust/guide/",

  // Maricopa County Assessor API
  assessorApiUrl: "https://mcassessor.maricopa.gov",
  assessorApiKey: process.env.ASSESSOR_API_KEY,

  // Stagehand/LLM Configuration
  geminiApiKey:
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  modelName: "google/gemini-2.5-flash-lite", // 1.5x faster, 20% cheaper than 2.0 Flash

  // Jina AI Configuration
  jinaApiKey: process.env.JINA_API_KEY,

  // Scraper settings
  searchUrl: "https://dm.maricopa.gov/applications/dustApplicationSearch.jsf",
  outputDir: "./output",

  // Browser settings
  headless: HEADLESS_OVERRIDE ?? true, // Default headless, set HEADLESS=false for debugging
  verbose: 1, // 0 = silent, 1 = normal, 2 = debug

  // Script-specific browser configuration
  scripts: {
    close: {
      headless: true, // close-permit.ts is stable, run headless by default
    },
    create: {
      headless: false, // create-application-full.ts still being debugged, run headed by default
    },
    delete: {
      headless: true, // delete.ts is stable, run headless by default
    },
    deleteAll: {
      headless: true, // delete-all.ts is stable, run headless by default
    },
    renew: {
      headless: true, // renew-permit.ts is stable, run headless by default
    },
    revise: {
      headless: true, // revise is similar to renew, run headless by default
    },
    scrape: {
      headless: true, // scrape extracts data, run headless by default
    },
    sync: {
      headless: true, // sync downloads XLS, run headless by default
    },
  },

  // E2E test configuration
  tests: {
    headless: HEADLESS_OVERRIDE ?? true, // E2E tests run headless by default, respects HEADLESS env
    timeout: 30_000,
    permitId: process.env.CLOSE_TEST_PERMIT_ID || "D0063431",
  },
};

/**
 * Portal login credentials.
 * Loaded from DUST_PERMIT_USERNAME and DUST_PERMIT_PASSWORD environment variables.
 */
export const credentials = {
  password: process.env.DUST_PERMIT_PASSWORD,
  username: process.env.DUST_PERMIT_USERNAME,
};

/**
 * Cached set of known contractor names.
 * Loaded from contractor-list.csv on first use.
 */
let knownContractors: Set<string> | null = null;

/**
 * Check if a company is in the known contractors list.
 *
 * Loads the contractor list from contractor-list.csv on first call
 * and caches it for subsequent calls. If the CSV is not found,
 * returns true (assumes known) to avoid accidentally using new company flow.
 *
 * @param companyName - Company name to check
 * @returns True if company is in the known contractors list
 */
export async function isKnownContractor(companyName: string): Promise<boolean> {
  if (!knownContractors) {
    try {
      const csvPath = "./contractor-list.csv";
      const file = Bun.file(csvPath);
      const exists = await file.exists();
      if (!exists) {
        console.log(
          "  Warning: contractor-list.csv not found. Defaulting to existing-company flow unless IS_NEW_COMPANY=true"
        );
        // Treat as "known" to avoid forcing the New Company flow by accident.
        knownContractors = new Set<string>();
        return true;
      }

      const csvContent = await file.text();
      const lines = csvContent.split("\n").slice(1); // Skip header
      knownContractors = new Set(
        lines
          .map((line) => {
            const parts = line.split(",");
            return parts[1]?.trim(); // Company Name is second column
          })
          .filter((name): name is string => Boolean(name))
      );
      console.log(`  Loaded ${knownContractors.size} known contractors`);
    } catch {
      console.log("  Warning: Could not load contractor-list.csv");
      knownContractors = new Set<string>();
    }
  }
  return knownContractors?.has(companyName) ?? false;
}

/**
 * Get headless setting for a specific script or use global default.
 *
 * Resolves headless setting using priority order:
 * 1. Environment variable `HEADLESS` (if set)
 * 2. Script-specific `config.scripts.<name>.headless`
 * 3. Global default `config.headless`
 *
 * @param scriptName - Name of the script (key in config.scripts)
 * @returns true if should run headless, false otherwise
 *
 * @example
 * import { getHeadlessSetting, config } from "@/portal/utils/config";
 * import { createBrowser } from "@/portal/utils/browser";
 *
 * // delete-all.ts
 * const browser = await createBrowser({
 *   headless: getHeadlessSetting("deleteAll")
 * });
 *
 * // Custom script not in config
 * const browser = await createBrowser({
 *   headless: config.headless
 * });
 */
export function getHeadlessSetting(
  scriptName?: keyof typeof config.scripts
): boolean {
  // 1. Check environment variable override
  if (HEADLESS_OVERRIDE !== undefined) {
    return HEADLESS_OVERRIDE;
  }

  // 2. Check script-specific setting
  if (scriptName && config.scripts[scriptName]) {
    return config.scripts[scriptName].headless;
  }

  // 3. Fall back to global default
  return config.headless;
}

/**
 * Validate that required environment variables are set.
 *
 * Checks for GEMINI_API_KEY and logs an error if missing.
 *
 * @returns Object with valid flag and array of missing variable names
 *
 * @example
 * const { valid, missing } = validateEnv();
 * if (!valid) {
 *   console.error(`Missing: ${missing.join(", ")}`);
 *   process.exit(1);
 * }
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  const required = ["GEMINI_API_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      "Missing required environment variables:",
      missing.join(", ")
    );
  }

  return { missing, valid: missing.length === 0 };
}

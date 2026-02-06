import type { BrowserContext, Page } from "playwright";
import {
  type BrowserInstance,
  closeBrowser,
  createBrowser,
} from "@/portal/utils/browser";
import { config } from "@/portal/utils/config";
import {
  navigateToDustSearch,
  navigateToMyDustApps,
  SETTLE_MS,
  sleep,
} from "@/portal/utils/helpers";
import { login } from "@/portal/utils/login";

/**
 * Session state for tracking navigation
 */
type SessionState = "disconnected" | "logged_in" | "dust_apps" | "dust_search";

/**
 * Standard Portal E2E Test Harness
 *
 * Provides a clinical, consistent interface for interacting with and
 * verifying the Maricopa County portal.
 *
 * @example
 * const harness = new PortalHarness();
 * await harness.setup();
 * await harness.navigateToSearch();
 * // ... run test
 * await harness.teardown();
 */
export class PortalHarness {
  private instance: BrowserInstance | null = null;
  private state: SessionState = "disconnected";

  /**
   * Initialize browser and login
   */
  async setup(options: { headless?: boolean } = {}): Promise<this> {
    this.instance = await createBrowser({
      headless: options.headless ?? config.tests.headless,
    });
    const success = await login(this.page);
    if (!success) {
      throw new Error("PortalHarness: Login failed during setup");
    }
    this.state = "logged_in";
    return this;
  }

  /**
   * Clean up browser resources
   */
  async teardown(): Promise<void> {
    if (this.instance) {
      await closeBrowser(this.instance);
    }
    this.state = "disconnected";
    this.instance = null;
  }

  get page(): Page {
    if (!this.instance) {
      throw new Error("PortalHarness: Not initialized. Call setup() first.");
    }
    return this.instance.page;
  }

  get context(): BrowserContext {
    if (!this.instance) {
      throw new Error("PortalHarness: Not initialized. Call setup() first.");
    }
    return this.instance.context;
  }

  get currentState(): SessionState {
    return this.state;
  }

  // ==========================================================================
  // NAVIGATION METHODS
  // ==========================================================================

  /**
   * Navigate to My Dust Apps page (pre-requisite for most operations)
   */
  async navigateToDustApps(): Promise<boolean> {
    if (this.state === "disconnected") {
      throw new Error("PortalHarness: Not logged in");
    }
    const success = await navigateToMyDustApps(this.page);
    if (success) {
      // Wait for page to fully settle - navigateToMyDustApps checks draftSection,
      // but other elements like newApplicationBtn may still be loading
      await sleep(SETTLE_MS);
      this.state = "dust_apps";
    }
    return success;
  }

  /**
   * Navigate to Dust Search page
   */
  async navigateToSearch(): Promise<boolean> {
    if (this.state === "disconnected") {
      throw new Error("PortalHarness: Not logged in");
    }
    // Must go through dust apps first
    if (this.state === "logged_in") {
      await this.navigateToDustApps();
    }
    const success = await navigateToDustSearch(this.page);
    if (success) {
      this.state = "dust_search";
    }
    return success;
  }

  /**
   * Full setup: login + navigate to search page
   */
  async setupForSearch(options: { headless?: boolean } = {}): Promise<this> {
    await this.setup({
      headless: options.headless ?? config.tests.headless,
    });
    await this.navigateToDustApps();
    await this.navigateToSearch();
    return this;
  }
}

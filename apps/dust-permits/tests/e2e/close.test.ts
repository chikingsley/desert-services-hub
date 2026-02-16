/**
 * Close Permit E2E Tests (Dry Run - does NOT actually close permits)
 *
 * Tests the close permit flow with step-by-step visibility.
 * Requires an ACTIVE permit (not a draft) - drafts cannot be "closed".
 *
 * Run with: bun test tests/e2e/close.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import type { Page } from "playwright";
import {
  cancelClosePermit,
  clickClosePermitButton,
  fillClosePermitDialog,
  hasClosePermitConfirmButton,
  searchAndOpenPermit,
} from "@/portal/close";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

// Must be an ACTIVE permit (not a draft) - drafts cannot be "closed"
const TEST_PERMIT_ID = "D0063431";

// Track popup across tests
let popupPage: Page | undefined;

describe("Close Permit Flow (Dry Run)", () => {
  afterAll(async () => {
    if (popupPage && !popupPage.isClosed()) {
      // Ignore close errors - popup may already be closed
      await popupPage.close().catch(() => {
        /* may already be closed */
      });
    }
    await harness.teardown();
  });

  test(
    "1. login",
    async () => {
      await harness.setup();
      expect(harness.currentState).toBe("logged_in");
    },
    TIMEOUTS.standard
  );

  test(
    "2. navigate to dust apps",
    async () => {
      const success = await harness.navigateToDustApps();
      expect(success).toBe(true);
      expect(harness.currentState).toBe("dust_apps");
    },
    TIMEOUTS.complex
  );

  test(
    "3. navigate to search",
    async () => {
      const success = await harness.navigateToSearch();
      expect(success).toBe(true);
      expect(harness.currentState).toBe("dust_search");
    },
    TIMEOUTS.complex
  );

  test(
    "4. search for permit and open detail",
    async () => {
      const opened = await searchAndOpenPermit(harness.page, TEST_PERMIT_ID);
      expect(opened).toBe(true);
    },
    TIMEOUTS.standard
  );

  test(
    "5. click Close Permit and open popup",
    async () => {
      popupPage = await clickClosePermitButton(harness.page, harness.context);
      expect(popupPage).toBeDefined();
    },
    TIMEOUTS.complex
  );

  test(
    "6. fill close permit dialog (dry run)",
    async () => {
      expect(popupPage).toBeDefined();
      if (!popupPage) {
        return;
      }

      const formState = await fillClosePermitDialog(popupPage);

      expect(formState.hasForm).toBe(true);
      expect(formState.reasonFilled).toBe(true);
      expect(formState.gravelChecked).toBe(true);
      expect(formState.buildingsChecked).toBe(true);
      expect(formState.acreChecked).toBe(true);
    },
    TIMEOUTS.standard
  );

  test(
    "7. confirm button is available after filling",
    async () => {
      expect(popupPage).toBeDefined();
      if (!popupPage) {
        return;
      }

      const hasConfirm = await hasClosePermitConfirmButton(popupPage);
      expect(hasConfirm).toBe(true);
    },
    TIMEOUTS.quick
  );

  test(
    "8. cancel without closing permit",
    async () => {
      expect(popupPage).toBeDefined();
      if (!popupPage) {
        return;
      }

      const cancelled = await cancelClosePermit(popupPage);
      expect(cancelled).toBe(true);

      const pageCount = harness.context.pages().length;
      expect(pageCount).toBe(1);

      popupPage = undefined;
    },
    TIMEOUTS.quick
  );
});

/**
 * Delete E2E Tests
 *
 * Tests the delete flow functions using a single browser session.
 * Each test builds on the previous state where appropriate.
 *
 * Run with: bun test tests/e2e/delete.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { createNewCompanyApplication } from "@/portal/create";
import {
  clickFirstDraftApp,
  countDraftApps,
  deleteApplication,
  deleteByApplicationId,
  deleteSingleDraft,
  findFirstDraftAppLink,
  getDetailState,
} from "@/portal/delete";
import { DUST_APPLICATION_ID_REGEX } from "@/portal/utils/helpers";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

const COPY_FROM_APP = process.env.COPY_FROM_APP_NUMBER ?? "";

const APP_ID_PATTERN = DUST_APPLICATION_ID_REGEX;

const describeSuite = COPY_FROM_APP ? describe : describe.skip;

describeSuite("Delete Flow", () => {
  afterAll(async () => {
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
    "3. can count draft applications",
    async () => {
      const count = await countDraftApps(harness.page);
      expect(count).toBeGreaterThanOrEqual(0);
    },
    TIMEOUTS.quick
  );

  test(
    "4. can find and open draft app (creates one first)",
    async () => {
      const createResult = await createNewCompanyApplication(
        harness.page,
        harness.context,
        COPY_FROM_APP
      );
      expect(createResult.success).toBe(true);
      expect(createResult.applicationId).not.toBeNull();
      if (!createResult.applicationId) {
        throw new Error("applicationId is null");
      }
      const createdAppId = createResult.applicationId;

      await harness.navigateToDustApps();

      const found = await findFirstDraftAppLink(harness.page);
      expect(found).not.toBeNull();
      expect(found?.appNum).toMatch(APP_ID_PATTERN);

      const appNum = await clickFirstDraftApp(harness.page);
      expect(appNum).not.toBeNull();
      expect(appNum).toMatch(APP_ID_PATTERN);

      const state = await getDetailState(harness.page);
      expect(state.hasDeleteBtn || state.hasDetailForm).toBe(true);

      const deleted = await deleteByApplicationId(
        harness.page,
        harness.context,
        createdAppId
      );
      expect(deleted).toBe(true);
    },
    TIMEOUTS.complex
  );

  test(
    "5. can delete a draft application (creates one first)",
    async () => {
      await harness.navigateToDustApps();

      const createResult = await createNewCompanyApplication(
        harness.page,
        harness.context,
        COPY_FROM_APP
      );
      expect(createResult.success).toBe(true);
      if (!createResult.applicationId) {
        throw new Error("applicationId is null");
      }

      await harness.navigateToDustApps();

      const appNum = await clickFirstDraftApp(harness.page);
      expect(appNum).not.toBeNull();

      const deleted = await deleteApplication(harness.page, harness.context);
      expect(deleted).toBe(true);

      const navigatedBack = await harness.navigateToDustApps();
      expect(navigatedBack).toBe(true);

      const stillExists = await harness.page.evaluate((deletedAppNum) => {
        const links = [...document.querySelectorAll("a")];
        return links.some(
          (a) => (a.textContent || "").trim() === deletedAppNum
        );
      }, appNum);

      expect(stillExists).toBe(false);
    },
    TIMEOUTS.complex
  );

  test(
    "6. deleteSingleDraft handles full flow (creates one first)",
    async () => {
      await harness.navigateToDustApps();

      const createResult = await createNewCompanyApplication(
        harness.page,
        harness.context,
        COPY_FROM_APP
      );
      expect(createResult.success).toBe(true);
      if (!createResult.applicationId) {
        throw new Error("applicationId is null");
      }
      const createdAppId = createResult.applicationId;

      await harness.navigateToDustApps();
      const countBefore = await countDraftApps(harness.page);

      const result = await deleteSingleDraft(harness.page, harness.context);
      expect(result).toBe(true);

      await harness.navigateToDustApps();
      const countAfter = await countDraftApps(harness.page);

      expect(countAfter).toBe(countBefore - 1);

      const createdStillExists = await harness.page.evaluate((appId) => {
        const links = [...document.querySelectorAll("a")];
        return links.some((a) => (a.textContent || "").trim() === appId);
      }, createdAppId);

      if (createdStillExists) {
        await deleteByApplicationId(
          harness.page,
          harness.context,
          createdAppId
        );
      }
    },
    TIMEOUTS.complex
  );

  test(
    "7. can delete multiple drafts (creates 2, deletes both)",
    async () => {
      await harness.navigateToDustApps();

      const create1 = await createNewCompanyApplication(
        harness.page,
        harness.context,
        COPY_FROM_APP
      );
      expect(create1.success).toBe(true);
      if (!create1.applicationId) {
        throw new Error("applicationId is null");
      }
      const app1 = create1.applicationId;

      await harness.navigateToDustApps();

      const create2 = await createNewCompanyApplication(
        harness.page,
        harness.context,
        COPY_FROM_APP
      );
      expect(create2.success).toBe(true);
      if (!create2.applicationId) {
        throw new Error("applicationId is null");
      }
      const app2 = create2.applicationId;

      const deleted1 = await deleteByApplicationId(
        harness.page,
        harness.context,
        app1
      );
      expect(deleted1).toBe(true);

      await harness.page.waitForTimeout(2000);

      const deleted2 = await deleteByApplicationId(
        harness.page,
        harness.context,
        app2
      );
      expect(deleted2).toBe(true);

      await harness.navigateToDustApps();

      const app1Exists = await harness.page.evaluate((appId) => {
        const links = [...document.querySelectorAll("a")];
        return links.some((a) => (a.textContent || "").trim() === appId);
      }, app1);

      const app2Exists = await harness.page.evaluate((appId) => {
        const links = [...document.querySelectorAll("a")];
        return links.some((a) => (a.textContent || "").trim() === appId);
      }, app2);

      expect(app1Exists).toBe(false);
      expect(app2Exists).toBe(false);
    },
    TIMEOUTS.extended
  );
});

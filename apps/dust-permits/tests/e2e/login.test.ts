import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { navigateToMyDustApps } from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

describe("Login Test", () => {
  const harness = new PortalHarness();

  beforeAll(async () => {
    await harness.setup();
  }, TIMEOUTS.standard);

  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "can access My Dust Apps table",
    async () => {
      const success = await navigateToMyDustApps(harness.page);
      expect(success).toBe(true);

      const tableVisible = await harness.page.isVisible(
        portal.dustApps.draftTable
      );
      expect(tableVisible).toBe(true);
    },
    TIMEOUTS.standard
  );

  test(
    "can see New Application button",
    async () => {
      const btnVisible = await harness.page.isVisible(
        portal.dustApps.newApplicationBtn
      );
      expect(btnVisible).toBe(true);
    },
    TIMEOUTS.quick
  );
});

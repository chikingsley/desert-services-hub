import { afterEach, describe, expect, mock, test } from "bun:test";

const applicationModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/portal/create/application.ts"
);
const helpersModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/portal/utils/helpers.ts"
);
const actualHelpers = await import(helpersModuleUrl);

function installHelperMocks() {
  const helperFactory = () => ({
    ...actualHelpers,
    SETTLE_MS: 0,
    sleep: async () => {},
  });

  mock.module("@/portal/utils/helpers", helperFactory);
  mock.module(helpersModuleUrl, helperFactory);
}

describe("waitForApplicationCreated", () => {
  afterEach(() => {
    mock.restore();
  });

  test("keeps polling when the page context resets during navigation", async () => {
    installHelperMocks();

    const { waitForApplicationCreated } = await import(
      `${applicationModuleUrl}?navigation-reset-${Date.now()}`
    );

    let visibleCalls = 0;
    let evaluateCalls = 0;
    const fakePage = {
      evaluate: async () => {
        evaluateCalls += 1;
        return evaluateCalls >= 2 ? "D0065540" : null;
      },
      isVisible: async () => {
        visibleCalls += 1;
        if (visibleCalls === 1) {
          throw new Error(
            "Execution context was destroyed, most likely because of a navigation"
          );
        }
        return false;
      },
      waitForLoadState: async () => {},
    };

    await expect(waitForApplicationCreated(fakePage as never, 50)).resolves.toBe(
      true
    );
  });
});

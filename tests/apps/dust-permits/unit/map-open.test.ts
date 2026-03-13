import { afterEach, describe, expect, mock, test } from "bun:test";
import { portal } from "@/portal/utils/selectors";
const helpersModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/portal/utils/helpers.ts"
);
const actualHelpers = await import(helpersModuleUrl);

const helperState = {
  popupWaits: 0,
  waitForElementCalls: [] as string[],
};

mock.module("@/portal/utils/helpers", () => ({
  ...actualHelpers,
  sleep: async () => {},
  waitForElement: async (_page: unknown, selector: string) => {
    helperState.waitForElementCalls.push(selector);
    return selector === portal.page2.editSiteDrawingBtn;
  },
  waitForPopup: async () => {
    helperState.popupWaits += 1;
    return {
      waitForLoadState: async () => {},
    };
  },
}));

mock.module("@/portal/create/navigation", () => ({
  goToPage: async () => ({ debug: "Reached page 2", success: true }),
}));

describe("openMapPopup", () => {
  afterEach(() => {
    helperState.popupWaits = 0;
    helperState.waitForElementCalls.length = 0;
    mock.restore();
  });

  test("opens the popup through Edit Site Drawing when copied map data already exists", async () => {
    const clickedSelectors: string[] = [];

    const fakePage = {
      evaluate: async () => false,
      locator(selector: string) {
        return {
          click: async () => {
            if (
              selector !== portal.page2.editSiteDrawingBtn &&
              selector !== 'a.xj:has-text("2. Project Location")'
            ) {
              throw new Error(`unexpected click for ${selector}`);
            }
            clickedSelectors.push(selector);
          },
          count: async () =>
            selector === 'a.xj:has-text("2. Project Location")' ? 1 : 0,
          first() {
            return this;
          },
          isVisible: async () => false,
        };
      },
      waitForLoadState: async () => {},
    };

    const cacheBuster = `open-map-popup-${Date.now()}-${Math.random()}`;
    const { openMapPopup } = await import(
      `../../../../apps/dust-permits/src/portal/create/fill/page2/map.ts?${cacheBuster}`
    );

    const popup = await openMapPopup(fakePage as never, {} as never);

    expect(popup).not.toBeNull();
    expect(helperState.waitForElementCalls).toContain(
      portal.page2.editSiteDrawingBtn
    );
    expect(clickedSelectors).toContain(portal.page2.editSiteDrawingBtn);
    expect(helperState.popupWaits).toBe(1);
  });
});

import { describe, expect, test } from "bun:test";
import { getCurrentPage } from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";

const page1ApplicantField = '[id="ThePage:siTable:1:sioTable:0:siForm:text"]';

function createLocator(count: number, visible = count > 0) {
  return {
    count: async () => count,
    first() {
      return this;
    },
    getAttribute: async () => null,
    isVisible: async () => visible,
  };
}

describe("getCurrentPage", () => {
  test("returns page 2 when only Edit Site Drawing is visible", async () => {
    const counts = new Map<string, number>([
      [portal.page2.editSiteDrawingBtn, 1],
    ]);

    const fakePage = {
      locator(selector: string) {
        return createLocator(counts.get(selector) ?? 0);
      },
    };

    await expect(getCurrentPage(fakePage as never)).resolves.toBe(2);
  });

  test("ignores hidden page 1 markers when page 2 is actually active", async () => {
    const counts = new Map<string, { count: number; visible: boolean }>([
      [page1ApplicantField, { count: 1, visible: false }],
      [portal.page2.editSiteDrawingBtn, { count: 1, visible: true }],
    ]);

    const fakePage = {
      locator(selector: string) {
        const state = counts.get(selector) ?? { count: 0, visible: false };
        return createLocator(state.count, state.visible);
      },
    };

    await expect(getCurrentPage(fakePage as never)).resolves.toBe(2);
  });
});

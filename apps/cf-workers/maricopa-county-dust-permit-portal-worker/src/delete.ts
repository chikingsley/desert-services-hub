import type { BrowserContext, Page } from "playwright";

import { openMyDustApps } from "./create";
import {
  PORTAL_TIMINGS,
  clickInFrames,
  hasSelector,
  log,
  pollUntil,
  settlePortalUi,
  waitForVisible,
} from "./portal-shared";

export interface DraftApplication {
  id: string;
  index: number;
}

export interface DeleteDraftsResult {
  code?: "delete_failed" | "navigate_failed" | "not_found";
  deletedCount: number;
  deletedIds: string[];
  error?: string;
  failedIds: string[];
  success: boolean;
}

export interface DeleteDraftOps {
  deleteOpenedDraft: () => Promise<boolean>;
  ensureDraftList: () => Promise<boolean>;
  listDrafts: () => Promise<DraftApplication[]>;
  openDraft: (draft: DraftApplication) => Promise<boolean>;
}

const DRAFT_ID_RE = /^D\d{7}$/i;

const sel = {
  deleteBtn: 'img[alt="Delete Application"]',
  deleteConfirm:
    'img[alt="Delete"], img[title="Delete"], input[value="Delete"]',
  detailForm: "[id*='dustApplicationDetail']",
  draftSection: "text=Draft Dust Applications",
  draftTable: "div[id*='draftDustAppTable']",
  newAppBtn: 'img[alt="New Application"]',
} as const;

const normalizeId = (id: string): string => {
  const s = id.trim().toUpperCase();
  return s.startsWith("D") ? s : `D${s}`;
};

const succeed = (
  deletedIds: string[],
  failedIds: string[],
): DeleteDraftsResult => ({
  deletedCount: deletedIds.length,
  deletedIds,
  failedIds,
  success: true,
});

const fail = (
  code: NonNullable<DeleteDraftsResult["code"]>,
  error: string,
  deletedIds: string[],
  failedIds: string[],
): DeleteDraftsResult => ({
  code,
  deletedCount: deletedIds.length,
  deletedIds,
  error,
  failedIds,
  success: false,
});

const listDraftApplications = async (
  page: Page,
): Promise<DraftApplication[]> => {
  const ready =
    (await waitForVisible(page, sel.newAppBtn, PORTAL_TIMINGS.readyMs)) ||
    (await waitForVisible(
      page,
      sel.draftTable,
      PORTAL_TIMINGS.readyMs,
    ));
  if (!ready) return [];

  await settlePortalUi();
  const links = page.locator(sel.draftTable).locator("a");
  const count = await links.count();
  const drafts: DraftApplication[] = [];

  for (let i = 0; i < count; i++) {
    const text = await links.nth(i).textContent();
    const id = text?.trim() ?? "";
    if (DRAFT_ID_RE.test(id)) drafts.push({ id, index: i });
  }

  log(
    "DELETE",
    `found ${drafts.length} drafts`,
    drafts.map((d) => d.id),
  );
  return drafts;
};

const isDraftDetail = async (page: Page): Promise<boolean> =>
  page.url().includes("dustApplicationDetail.jsf") ||
  (await hasSelector(page, sel.deleteBtn)) ||
  (await hasSelector(page, sel.detailForm));

const openDraftDetail = async (
  page: Page,
  draft: DraftApplication,
): Promise<boolean> => {
  const links = page.locator(sel.draftTable).locator("a");
  if ((await links.count()) <= draft.index) return false;

  log("DELETE", "opening draft", draft.id);
  try {
    await links.nth(draft.index).click({
      force: true,
      noWaitAfter: true,
      timeout: PORTAL_TIMINGS.quickMs,
    });
    await settlePortalUi();
  } catch {
    log("DELETE", "FAIL: click on draft link failed", draft.id);
    return false;
  }

  const ready = Boolean(
    await pollUntil(() => isDraftDetail(page), {
      timeoutMs: PORTAL_TIMINGS.readyMs,
      isDone: Boolean,
    }),
  );
  log(
    "DELETE",
    ready
      ? `opened ${draft.id}`
      : `FAIL: detail page not reached for ${draft.id}`,
  );
  return ready;
};

const deleteCurrentDraft = async (
  page: Page,
  context: BrowserContext,
  draftId?: string,
): Promise<boolean> => {
  for (const p of context.pages().filter((p) => p !== page)) {
    await p.close().catch(() => {});
  }
  await settlePortalUi();

  log("DELETE", "clicking Delete Application", draftId);

  const popupPromise = context
    .waitForEvent("page", { timeout: PORTAL_TIMINGS.readyMs })
    .catch(() => null);

  const clicked = await clickInFrames(page, sel.deleteBtn);
  if (!clicked) {
    log("DELETE", "FAIL: Delete button not found");
    return false;
  }

  const popup = await popupPromise;

  if (popup) {
    log("DELETE", "confirmation popup opened");
    try {
      await popup.waitForLoadState("domcontentloaded", {
        timeout: PORTAL_TIMINGS.readyMs,
      });
    } catch {
      // Popup content may already be loaded.
    }
    await settlePortalUi();

    if (
      !(await clickInFrames(
        popup,
        sel.deleteConfirm,
        PORTAL_TIMINGS.quickMs,
      ))
    ) {
      log("DELETE", "FAIL: confirm click failed in popup");
      return false;
    }
    await settlePortalUi();
  } else {
    log("DELETE", "no popup, trying inline confirm");
    if (
      !(await clickInFrames(
        page,
        sel.deleteConfirm,
        PORTAL_TIMINGS.quickMs,
      ))
    ) {
      log("DELETE", "FAIL: no confirm button found");
      return false;
    }
  }

  const success = Boolean(
    await pollUntil(
      async () => {
        try {
          const text = (
            (await page.evaluate(() => document.body?.textContent)) ?? ""
          ).toLowerCase();
          return text.includes(
            "successfully deleted the dust application",
          );
        } catch {
          return false;
        }
      },
      { timeoutMs: PORTAL_TIMINGS.operationMs, isDone: Boolean },
    ),
  );

  log(
    "DELETE",
    success
      ? `deleted ${draftId ?? "draft"}`
      : `FAIL: no success message for ${draftId}`,
  );
  return success;
};

const createOps = (
  page: Page,
  context: BrowserContext,
): DeleteDraftOps => {
  let activeDraftId: string | null = null;

  return {
    deleteOpenedDraft: () =>
      deleteCurrentDraft(page, context, activeDraftId ?? undefined),

    async ensureDraftList() {
      for (const p of context.pages().filter((p) => p !== page)) {
        await p.close().catch(() => {});
      }
      if (!(await openMyDustApps(page))) return false;

      const ready =
        (await waitForVisible(
          page,
          sel.newAppBtn,
          PORTAL_TIMINGS.readyMs,
        )) ||
        (await waitForVisible(
          page,
          sel.draftTable,
          PORTAL_TIMINGS.readyMs,
        )) ||
        (await waitForVisible(
          page,
          sel.draftSection,
          PORTAL_TIMINGS.readyMs,
        ));
      if (ready) await settlePortalUi();
      return ready;
    },

    listDrafts: () => listDraftApplications(page),

    async openDraft(draft) {
      activeDraftId = draft.id;
      return openDraftDetail(page, draft);
    },
  };
};

export const deleteAllDraftsWithOps = async (
  ops: DeleteDraftOps,
): Promise<DeleteDraftsResult> => {
  const deletedIds: string[] = [];
  const failedIds = new Set<string>();

  for (let round = 0; round < 50; round++) {
    if (!(await ops.ensureDraftList())) {
      return fail(
        "navigate_failed",
        "Could not reach draft list",
        deletedIds,
        [...failedIds],
      );
    }

    const drafts = await ops.listDrafts();
    const pending = drafts.filter(
      (d) => !failedIds.has(d.id) && !deletedIds.includes(d.id),
    );
    log(
      "DELETE",
      `round ${round + 1}: ${pending.length} pending, ${drafts.length} total`,
    );

    if (pending.length === 0) return succeed(deletedIds, [...failedIds]);

    const target = pending[0]!;
    if (!(await ops.openDraft(target))) {
      failedIds.add(target.id);
      continue;
    }
    if (!(await ops.deleteOpenedDraft())) {
      failedIds.add(target.id);
      continue;
    }
    deletedIds.push(target.id);
  }

  return fail(
    "delete_failed",
    "Exceeded iteration limit",
    deletedIds,
    [...failedIds],
  );
};

export const deleteDraftByApplicationIdWithOps = async (
  ops: DeleteDraftOps,
  applicationId: string,
): Promise<DeleteDraftsResult> => {
  if (!(await ops.ensureDraftList())) {
    return fail("navigate_failed", "Could not reach draft list", [], []);
  }

  const drafts = await ops.listDrafts();
  const normalized = normalizeId(applicationId);
  const target = drafts.find((d) => normalizeId(d.id) === normalized);
  if (!target) {
    return fail("not_found", `Draft ${normalized} not found`, [], []);
  }

  if (!(await ops.openDraft(target))) {
    return fail(
      "delete_failed",
      `Could not open ${target.id}`,
      [],
      [target.id],
    );
  }
  if (!(await ops.deleteOpenedDraft())) {
    return fail(
      "delete_failed",
      `Could not delete ${target.id}`,
      [],
      [target.id],
    );
  }

  return succeed([target.id], []);
};

export const deleteAllDrafts = (
  page: Page,
  context: BrowserContext,
): Promise<DeleteDraftsResult> =>
  deleteAllDraftsWithOps(createOps(page, context));

export const deleteDraftByApplicationId = (
  page: Page,
  context: BrowserContext,
  applicationId: string,
): Promise<DeleteDraftsResult> =>
  deleteDraftByApplicationIdWithOps(
    createOps(page, context),
    applicationId,
  );

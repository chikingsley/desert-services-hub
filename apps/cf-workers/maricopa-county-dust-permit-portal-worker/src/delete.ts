import type { BrowserContext, Page } from "playwright";

import { openMyDustApps } from "./create";
import {
  PORTAL_TIMINGS,
  hasSelector,
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

type ClickStrategy = "force" | "standard";

const DUST_APPLICATION_ID_REGEX = /^D\d{7}$/i;
const DUST_APPLICATION_DETAIL_URL_FRAGMENT =
  "/applications/dustApplicationDetail.jsf";

const selectors = {
  deleteButton: 'img[alt="Delete Application"]',
  deleteCancelButton: 'img[alt="Cancel"]',
  deleteConfirmButtons: [
    'img[alt="Delete"]',
    'img[title="Delete"]',
    'input[value="Delete"]',
    'button:has-text("Delete")',
    'a:has-text("Delete")',
  ],
  detailForm: "form#dustApplicationDetail",
  detailFormAlt: "[id*='dustApplicationDetail']",
  draftSection: "text=Draft Dust Applications",
  draftTable: "div[id*='draftDustAppTable']",
  newApplicationButton: 'img[alt="New Application"]',
} as const;

const normalizeApplicationId = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    return normalized;
  }

  return normalized.startsWith("D") ? normalized : `D${normalized}`;
};

const waitForPopup = async (
  context: BrowserContext,
  click: () => Promise<boolean>,
  timeoutMs = PORTAL_TIMINGS.readyMs
): Promise<Page | null> => {
  const popupPromise = context
    .waitForEvent("page", { timeout: timeoutMs })
    .catch(() => null);

  if (!(await click())) {
    return null;
  }

  const popup = await popupPromise;
  if (!popup) {
    console.log("[DELETE] no popup was emitted after delete click");
    return null;
  }

  return popup;
};

const getDraftLinkCandidates = (page: Page) =>
  page.locator(selectors.draftTable).locator("a");

const isDraftDetailPage = async (page: Page): Promise<boolean> =>
  page.url().includes(DUST_APPLICATION_DETAIL_URL_FRAGMENT) ||
  (await hasSelector(page, selectors.deleteButton)) ||
  (await hasSelector(page, selectors.detailForm)) ||
  (await hasSelector(page, selectors.detailFormAlt));

const clickInFrames = async (
  page: Page,
  selector: string
): Promise<boolean> => {
  for (const frame of page.frames()) {
    try {
      const locator = frame.locator(selector).first();
      if ((await locator.count()) === 0) {
        continue;
      }

      await locator.click({
        force: true,
        timeout: PORTAL_TIMINGS.quickMs,
      });
      await settlePortalUi();
      return true;
    } catch {
      // Try the next frame.
    }
  }

  return false;
};

const clickAnySelectorInFrames = async (
  page: Page,
  selectorsList: readonly string[]
): Promise<boolean> => {
  for (const selector of selectorsList) {
    if (await clickInFrames(page, selector)) {
      return true;
    }
  }

  return false;
};

const hasDeleteSuccessMessage = async (
  page: Page,
  applicationId?: string | null
): Promise<boolean> => {
  try {
    const text = (
      (await page.evaluate(() => document.body?.textContent)) ?? ""
    ).toLowerCase();
    const successPhrase = "successfully deleted the dust application";
    if (!text.includes(successPhrase)) {
      return false;
    }

    if (!applicationId) {
      return true;
    }

    return text.includes(applicationId.toLowerCase());
  } catch {
    return false;
  }
};

const closeNonMainPages = async (
  context: BrowserContext,
  mainPage: Page
): Promise<void> => {
  const popupPages = context.pages().filter((popup) => popup !== mainPage);
  await Promise.all(
    popupPages.map((popup) =>
      popup.close().catch(() => {
        // Ignore stale popup cleanup errors.
      })
    )
  );
};

const waitForDeletionSuccess = async (
  page: Page,
  applicationId?: string | null,
  timeoutMs = PORTAL_TIMINGS.operationMs
): Promise<boolean> => {
  const result = await pollUntil(
    async () => await hasDeleteSuccessMessage(page, applicationId),
    {
      timeoutMs,
      isDone: Boolean,
    }
  );
  console.log("[DELETE] delete settle", Boolean(result), page.url());
  return Boolean(result);
};

const waitForDraftDetailPage = async (
  page: Page,
  timeoutMs = PORTAL_TIMINGS.readyMs
): Promise<boolean> =>
  Boolean(
    await pollUntil(
      async () => await isDraftDetailPage(page),
      {
        timeoutMs,
        isDone: Boolean,
      }
    )
  );

const listDraftApplications = async (
  page: Page
): Promise<DraftApplication[]> => {
  if (
    !(await waitForVisible(
      page,
      selectors.newApplicationButton,
      PORTAL_TIMINGS.readyMs
    )) &&
    !(await waitForVisible(page, selectors.draftTable, PORTAL_TIMINGS.readyMs))
  ) {
    return [];
  }

  await settlePortalUi();
  const links = getDraftLinkCandidates(page);
  const draftApplications: DraftApplication[] = [];
  const linkCount = await links.count();

  for (let index = 0; index < linkCount; index += 1) {
    const textContent = await links.nth(index).textContent();
    const id = textContent?.trim() ?? "";
    if (!DUST_APPLICATION_ID_REGEX.test(id)) {
      continue;
    }

    draftApplications.push({ id, index });
  }

  return draftApplications;
};

const clickDraftLink = async (
  page: Page,
  index: number
): Promise<boolean> => {
  const strategies: ReadonlyArray<{
    execute: (link: ReturnType<typeof page.locator>) => Promise<void>;
    name: ClickStrategy;
  }> = [
    {
      execute: (link) =>
        link.click({
          force: true,
          noWaitAfter: true,
          timeout: PORTAL_TIMINGS.quickMs,
        }),
      name: "force",
    },
    {
      execute: (link) =>
        link.click({
          noWaitAfter: true,
          timeout: PORTAL_TIMINGS.quickMs,
        }),
      name: "standard",
    },
  ];

  for (const strategy of strategies) {
    const links = getDraftLinkCandidates(page);
    if ((await links.count()) <= index) {
      return false;
    }

    try {
      await strategy.execute(links.nth(index));
      await settlePortalUi();
      const reachedDetailPage = await isDraftDetailPage(page);
      console.log("[DELETE] click strategy", strategy.name, reachedDetailPage);
      if (reachedDetailPage) {
        return true;
      }
    } catch {
      // Try the next click strategy.
    }
  }

  return false;
};

const deleteOpenedDraft = async (
  page: Page,
  context: BrowserContext,
  applicationId?: string | null
): Promise<boolean> => {
  await closeNonMainPages(context, page);
  await settlePortalUi();

  const clickDeleteButton = async (): Promise<boolean> => {
    const clicked = await page
      .locator(selectors.deleteButton)
      .first()
      .click({ timeout: PORTAL_TIMINGS.quickMs })
      .then(() => true)
      .catch(() => false);
    if (clicked) {
      await settlePortalUi();
      return true;
    }

    return await clickInFrames(page, selectors.deleteButton);
  };

  const popup = await waitForPopup(context, clickDeleteButton);
  if (popup) {
    console.log("[DELETE] confirmation popup opened", applicationId);
    await popup
      .waitForLoadState("domcontentloaded", {
        timeout: PORTAL_TIMINGS.readyMs,
      })
      .catch(() => {});
    await settlePortalUi();

    if (!(await clickAnySelectorInFrames(popup, selectors.deleteConfirmButtons))) {
      console.log("[DELETE] popup confirm selector not found", applicationId);
      return false;
    }

    await settlePortalUi();
    if (!popup.isClosed()) {
      await clickAnySelectorInFrames(popup, [selectors.deleteCancelButton]);
    }

    return await waitForDeletionSuccess(page, applicationId);
  }

  console.log("[DELETE] popup did not open; trying inline confirm path");
  if (!(await clickAnySelectorInFrames(page, selectors.deleteConfirmButtons))) {
    console.log("[DELETE] inline confirm not possible");
    return false;
  }

  return await waitForDeletionSuccess(page, applicationId);
};

const createDeleteDraftOps = (
  page: Page,
  context: BrowserContext
): DeleteDraftOps => {
  let activeDraftId: string | null = null;

  return {
    deleteOpenedDraft() {
      console.log("[DELETE] deleting current draft");
      return deleteOpenedDraft(page, context, activeDraftId);
    },
    async ensureDraftList() {
      console.log("[DELETE] ensuring draft list");
      await closeNonMainPages(context, page);
      if (!(await openMyDustApps(page))) {
        console.log("[DELETE] could not open dust apps");
        return false;
      }

      const ready =
        (await waitForVisible(
          page,
          selectors.newApplicationButton,
          PORTAL_TIMINGS.readyMs
        )) ||
        (await waitForVisible(
          page,
          selectors.draftTable,
          PORTAL_TIMINGS.readyMs
        )) ||
        (await waitForVisible(
          page,
          selectors.draftSection,
          PORTAL_TIMINGS.readyMs
        ));
      if (!ready) {
        console.log("[DELETE] draft list not ready");
        return false;
      }

      await settlePortalUi();
      console.log("[DELETE] draft list ready", page.url());
      return true;
    },
    listDrafts() {
      console.log("[DELETE] listing drafts");
      return listDraftApplications(page);
    },
    async openDraft(draft) {
      console.log("[DELETE] opening draft", draft.id, draft.index);
      activeDraftId = draft.id;
      if (!(await clickDraftLink(page, draft.index))) {
        console.log("[DELETE] draft click failed", draft.id);
        return false;
      }

      const detailReady = await waitForDraftDetailPage(page);
      console.log("[DELETE] detail ready", draft.id, detailReady, page.url());
      return detailReady;
    },
  };
};

const refreshDraftList = async (
  ops: DeleteDraftOps
): Promise<DraftApplication[] | null> => {
  if (!(await ops.ensureDraftList())) {
    return null;
  }

  return await ops.listDrafts();
};

const draftListContainsId = (
  drafts: readonly DraftApplication[],
  applicationId: string
): boolean => {
  const normalizedApplicationId = normalizeApplicationId(applicationId);
  return drafts.some(
    (draft) => normalizeApplicationId(draft.id) === normalizedApplicationId
  );
};

const confirmDraftMissingFromList = async (
  ops: DeleteDraftOps,
  applicationId: string
): Promise<{ confirmed: boolean; drafts: DraftApplication[] }> => {
  const drafts = await pollUntil(
    async () => await refreshDraftList(ops),
    {
      timeoutMs: PORTAL_TIMINGS.operationMs,
      intervalMs: PORTAL_TIMINGS.settleMs,
      isDone: (draftsOnList) =>
        draftsOnList !== null &&
        !draftListContainsId(draftsOnList, applicationId),
    }
  );
  if (drafts) {
    return { confirmed: true, drafts };
  }

  const finalDrafts = await refreshDraftList(ops);
  if (!finalDrafts) {
    return { confirmed: false, drafts: [] };
  }

  return {
    confirmed: !draftListContainsId(finalDrafts, applicationId),
    drafts: finalDrafts,
  };
};

const buildSuccessResult = (
  deletedIds: string[],
  failedIds: string[]
): DeleteDraftsResult => ({
  deletedCount: deletedIds.length,
  deletedIds,
  failedIds,
  success: true,
});

const buildFailureResult = (
  code: NonNullable<DeleteDraftsResult["code"]>,
  error: string,
  deletedIds: string[],
  failedIds: string[]
): DeleteDraftsResult => ({
  code,
  deletedCount: deletedIds.length,
  deletedIds,
  error,
  failedIds,
  success: false,
});

export const deleteAllDraftsWithOps = async (
  ops: DeleteDraftOps
): Promise<DeleteDraftsResult> => {
  const deletedIds: string[] = [];
  const failedIds = new Set<string>();

  for (let attempt = 0; attempt < 100; attempt += 1) {
    console.log("[DELETE] loop", attempt + 1);

    const availableDrafts = await refreshDraftList(ops);
    if (!availableDrafts) {
      return buildFailureResult(
        "navigate_failed",
        "Could not reach the draft applications list",
        deletedIds,
        [...failedIds]
      );
    }

    let pendingDrafts = availableDrafts.filter(
      (draft) => !failedIds.has(draft.id) && !deletedIds.includes(draft.id)
    );
    console.log("[DELETE] available drafts", availableDrafts);

    if (pendingDrafts.length === 0) {
      const confirmedDrafts = await refreshDraftList(ops);
      if (!confirmedDrafts) {
        return buildFailureResult(
          "navigate_failed",
          "Could not confirm the draft applications list was stable",
          deletedIds,
          [...failedIds]
        );
      }

      pendingDrafts = confirmedDrafts.filter(
        (draft) => !failedIds.has(draft.id) && !deletedIds.includes(draft.id)
      );
      console.log("[DELETE] confirmed drafts after empty read", pendingDrafts);
      if (pendingDrafts.length === 0) {
        return buildSuccessResult(deletedIds, [...failedIds]);
      }
    }

    const [targetDraft] = pendingDrafts;
    if (!targetDraft) {
      return buildSuccessResult(deletedIds, [...failedIds]);
    }

    if (!(await ops.openDraft(targetDraft))) {
      console.log("[DELETE] could not open draft", targetDraft.id);
      failedIds.add(targetDraft.id);
      continue;
    }

    if (!(await ops.deleteOpenedDraft())) {
      console.log("[DELETE] could not delete draft", targetDraft.id);
      failedIds.add(targetDraft.id);
      continue;
    }

    const verification = await confirmDraftMissingFromList(ops, targetDraft.id);
    if (!verification.confirmed) {
      console.log(
        "[DELETE] draft still visible after delete attempt",
        targetDraft.id
      );
      console.log("[DELETE] visible draft IDs", verification.drafts);
      failedIds.add(targetDraft.id);
      continue;
    }

    deletedIds.push(targetDraft.id);
  }

  return buildFailureResult(
    "delete_failed",
    "Delete-all loop exceeded the iteration limit",
    deletedIds,
    [...failedIds]
  );
};

export const deleteDraftByApplicationIdWithOps = async (
  ops: DeleteDraftOps,
  applicationId: string
): Promise<DeleteDraftsResult> => {
  const availableDrafts = await refreshDraftList(ops);
  if (!availableDrafts) {
    return buildFailureResult(
      "navigate_failed",
      "Could not reach the draft applications list",
      [],
      []
    );
  }

  const normalizedApplicationId = normalizeApplicationId(applicationId);
  const targetDraft = availableDrafts.find(
    (draft) => normalizeApplicationId(draft.id) === normalizedApplicationId
  );
  if (!targetDraft) {
    return buildFailureResult(
      "not_found",
      `Draft ${normalizedApplicationId} was not found`,
      [],
      []
    );
  }

  if (!(await ops.openDraft(targetDraft))) {
    return buildFailureResult(
      "delete_failed",
      `Could not open draft ${targetDraft.id}`,
      [],
      [targetDraft.id]
    );
  }

  if (!(await ops.deleteOpenedDraft())) {
    return buildFailureResult(
      "delete_failed",
      `Could not delete draft ${targetDraft.id}`,
      [],
      [targetDraft.id]
    );
  }

  const verification = await confirmDraftMissingFromList(ops, targetDraft.id);
  if (!verification.confirmed) {
    return buildFailureResult(
      "delete_failed",
      `Draft ${targetDraft.id} remained visible after delete`,
      [],
      [targetDraft.id]
    );
  }

  return buildSuccessResult([targetDraft.id], []);
};

export const deleteAllDrafts = (
  page: Page,
  context: BrowserContext
): Promise<DeleteDraftsResult> =>
  deleteAllDraftsWithOps(createDeleteDraftOps(page, context));

export const deleteDraftByApplicationId = (
  page: Page,
  context: BrowserContext,
  applicationId: string
): Promise<DeleteDraftsResult> =>
  deleteDraftByApplicationIdWithOps(
    createDeleteDraftOps(page, context),
    applicationId
  );

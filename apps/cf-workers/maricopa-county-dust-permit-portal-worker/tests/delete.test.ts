import { describe, expect, it, vi } from "vitest";

import type { DeleteDraftOps, DraftApplication } from "../src/delete";
import {
  deleteAllDraftsWithOps,
  deleteDraftByApplicationIdWithOps,
} from "../src/delete";

const createDraft = (id: string, index = 0): DraftApplication => ({
  id,
  index,
});

const createOps = (
  overrides: Partial<DeleteDraftOps> = {},
): DeleteDraftOps => ({
  deleteOpenedDraft: vi.fn().mockResolvedValue(true),
  ensureDraftList: vi.fn().mockResolvedValue(true),
  listDrafts: vi.fn().mockResolvedValue([]),
  openDraft: vi.fn().mockResolvedValue(true),
  ...overrides,
});

describe("delete draft flows", () => {
  it("deletes a draft by application id", async () => {
    const target = createDraft("D0065946");
    const ops = createOps({
      listDrafts: vi.fn().mockResolvedValue([target]),
    });

    const result = await deleteDraftByApplicationIdWithOps(
      ops,
      target.id,
    );

    expect(result).toMatchObject({
      deletedCount: 1,
      deletedIds: [target.id],
      failedIds: [],
      success: true,
    });
    expect(ops.openDraft).toHaveBeenCalledWith(target);
    expect(ops.deleteOpenedDraft).toHaveBeenCalledTimes(1);
  });

  it("fails by-id delete when deleteOpenedDraft returns false", async () => {
    const target = createDraft("D0065947");
    const ops = createOps({
      deleteOpenedDraft: vi.fn().mockResolvedValue(false),
      listDrafts: vi.fn().mockResolvedValue([target]),
    });

    const result = await deleteDraftByApplicationIdWithOps(
      ops,
      target.id,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("delete_failed");
    expect(result.failedIds).toEqual([target.id]);
  });

  it("reports not_found when target draft is missing", async () => {
    const ops = createOps({
      listDrafts: vi.fn().mockResolvedValue([]),
    });

    const result = await deleteDraftByApplicationIdWithOps(
      ops,
      "D9999999",
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("not_found");
  });

  it("deletes all drafts across multiple rounds", async () => {
    const first = createDraft("D0065946");
    const second = createDraft("D0065957");
    let listCallCount = 0;
    const ops = createOps({
      listDrafts: vi.fn().mockImplementation(async () => {
        listCallCount += 1;
        switch (listCallCount) {
          case 1:
            return [first, second];
          case 2:
            return [second];
          default:
            return [];
        }
      }),
    });

    const result = await deleteAllDraftsWithOps(ops);

    expect(result).toMatchObject({
      deletedCount: 2,
      deletedIds: [first.id, second.id],
      failedIds: [],
      success: true,
    });
    expect(ops.openDraft).toHaveBeenNthCalledWith(1, first);
    expect(ops.openDraft).toHaveBeenNthCalledWith(2, second);
    expect(ops.deleteOpenedDraft).toHaveBeenCalledTimes(2);
  });

  it("skips drafts that fail to open and continues", async () => {
    const good = createDraft("D0065946", 0);
    const bad = createDraft("D0065947", 1);
    let listCallCount = 0;
    const ops = createOps({
      listDrafts: vi.fn().mockImplementation(async () => {
        listCallCount += 1;
        if (listCallCount <= 2) return [good, bad];
        return [];
      }),
      openDraft: vi.fn().mockImplementation(async (draft) => {
        return draft.id !== bad.id;
      }),
    });

    const result = await deleteAllDraftsWithOps(ops);

    expect(result.success).toBe(true);
    expect(result.deletedIds).toContain(good.id);
    expect(result.failedIds).toContain(bad.id);
  });
});

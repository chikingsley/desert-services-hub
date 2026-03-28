import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeleteDraftOps, DraftApplication } from "../src/delete";
import {
  deleteAllDraftsWithOps,
  deleteDraftByApplicationIdWithOps,
} from "../src/delete";

const createDraft = (id: string, index = 0): DraftApplication => ({ id, index });

const createOps = (
  overrides: Partial<DeleteDraftOps> = {}
): DeleteDraftOps => ({
  deleteOpenedDraft: vi.fn().mockResolvedValue(true),
  ensureDraftList: vi.fn().mockResolvedValue(true),
  listDrafts: vi.fn().mockResolvedValue([]),
  openDraft: vi.fn().mockResolvedValue(true),
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("delete draft flows", () => {
  it("verifies by-id deletion by waiting for the draft to disappear", async () => {
    const targetDraft = createDraft("D0065946");
    let listCallCount = 0;
    const ops = createOps({
      listDrafts: vi.fn().mockImplementation(async () => {
        listCallCount += 1;
        return listCallCount >= 2 ? [] : [targetDraft];
      }),
    });

    const result = await deleteDraftByApplicationIdWithOps(ops, targetDraft.id);

    expect(result).toMatchObject({
      deletedCount: 1,
      deletedIds: [targetDraft.id],
      failedIds: [],
      success: true,
    });
    expect(ops.openDraft).toHaveBeenCalledWith(targetDraft);
    expect(ops.deleteOpenedDraft).toHaveBeenCalledTimes(1);
  });

  it("fails by-id delete when the draft remains visible after delete", async () => {
    vi.useFakeTimers();

    const targetDraft = createDraft("D0065947");
    const ops = createOps({
      listDrafts: vi.fn().mockImplementation(async () => [targetDraft]),
    });

    const resultPromise = deleteDraftByApplicationIdWithOps(ops, targetDraft.id);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.code).toBe("delete_failed");
    expect(result.error).toContain("remained visible after delete");
    expect(result.failedIds).toEqual([targetDraft.id]);
    expect(ops.openDraft).toHaveBeenCalledWith(targetDraft);
    expect(ops.deleteOpenedDraft).toHaveBeenCalledTimes(1);
  });

  it("re-checks the draft list before delete-all declares success", async () => {
    const firstDraft = createDraft("D0065946");
    const secondDraft = createDraft("D0065957");
    let listCallCount = 0;
    const ops = createOps({
      listDrafts: vi.fn().mockImplementation(async () => {
        listCallCount += 1;
        switch (listCallCount) {
          case 1:
            return [firstDraft, secondDraft];
          case 2:
            return [secondDraft];
          case 3:
            return [];
          case 4:
            return [secondDraft];
          case 5:
            return [];
          default:
            return [];
        }
      }),
    });

    const result = await deleteAllDraftsWithOps(ops);

    expect(result).toMatchObject({
      deletedCount: 2,
      deletedIds: [firstDraft.id, secondDraft.id],
      failedIds: [],
      success: true,
    });
    expect(ops.openDraft).toHaveBeenNthCalledWith(1, firstDraft);
    expect(ops.openDraft).toHaveBeenNthCalledWith(2, secondDraft);
    expect(ops.deleteOpenedDraft).toHaveBeenCalledTimes(2);
  });
});

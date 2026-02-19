import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SyncOptions } from "@monday/sync/types";
import type { SharePointClient } from "@sharepoint/client";

interface SyncCall {
  client: SharePointClient;
  options: SyncOptions;
}

const calls: SyncCall[] = [];

mock.module("@monday/sync/sharepoint-sync", () => ({
  syncSharePointFoldersWithClient: (
    client: SharePointClient,
    options: SyncOptions = {}
  ) => {
    calls.push({ client, options });
    return {
      processed: 42,
      created: 3,
      moved: 5,
      skipped: 7,
      filesUploaded: 11,
      errors: ["e1", "e2"],
    };
  },
}));

const { syncEstimateFolders } = await import(
  "../../../../../packages/monday/cli/sync-estimates/core"
);

describe("syncEstimateFolders", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  test("delegates to canonical package sync and maps result shape", async () => {
    const client = {} as SharePointClient;
    const options: SyncOptions = { dryRun: true, limit: 10 };

    const result = await syncEstimateFolders(client, options);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ client, options });
    expect(result).toEqual({
      created: 3,
      moved: 5,
      skipped: 7,
      filesUploaded: 11,
      errors: ["e1", "e2"],
    });
  });

  test("passes default options when omitted", async () => {
    const client = {} as SharePointClient;

    await syncEstimateFolders(client);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toEqual({});
  });
});

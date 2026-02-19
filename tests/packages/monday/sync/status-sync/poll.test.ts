import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const calls = {
  gc: 0,
  leads: 0,
  links: 0,
};

const gcResult = {
  wonCount: 10,
  openSentCount: 20,
  toUpdateCount: 3,
  updatedCount: 1,
  errors: [] as string[],
};
const leadsResult = {
  leadsCount: 25,
  updatedCount: 2,
  skippedCount: 5,
  errors: [] as string[],
};
const linksResult = {
  enabled: true,
  leadsCount: 30,
  linkedLeads: 3,
  linkedEstimates: 4,
  linkedProjects: 5,
  projectNumbersUpdated: 6,
  skippedCount: 7,
  errors: [] as string[],
};

mock.module("@monday/sync/status-sync/gc-cleanup", () => ({
  runCleanup: () => {
    calls.gc += 1;
    return Promise.resolve(gcResult);
  },
}));

mock.module("@monday/sync/status-sync/leads-sync", () => ({
  runLeadsSync: () => {
    calls.leads += 1;
    return Promise.resolve(leadsResult);
  },
}));

mock.module("@monday/sync/status-sync/project-link-sync", () => ({
  runProjectLinkSync: () => {
    calls.links += 1;
    return Promise.resolve(linksResult);
  },
}));

const { pollMondayStatusSync } = await import("@monday/sync/status-sync/poll");

const originalMondayApiKey = process.env.MONDAY_API_KEY;

beforeEach(() => {
  calls.gc = 0;
  calls.leads = 0;
  calls.links = 0;
});

afterAll(() => {
  if (originalMondayApiKey === undefined) {
    process.env.MONDAY_API_KEY = undefined;
    return;
  }
  process.env.MONDAY_API_KEY = originalMondayApiKey;
});

describe("pollMondayStatusSync", () => {
  test("skips when MONDAY_API_KEY is missing", async () => {
    process.env.MONDAY_API_KEY = undefined;

    const result = await pollMondayStatusSync();

    expect(result).toEqual({
      skipped: true,
      reason: "MONDAY_API_KEY is not configured",
    });
    expect(calls.gc).toBe(0);
    expect(calls.leads).toBe(0);
    expect(calls.links).toBe(0);
  });

  test("runs all status sync steps when MONDAY_API_KEY is configured", async () => {
    process.env.MONDAY_API_KEY = "test-key";

    const result = await pollMondayStatusSync();

    expect(result.skipped).toBe(false);
    expect(result.gc).toEqual(gcResult);
    expect(result.leads).toEqual(leadsResult);
    expect(result.projectLinks).toEqual(linksResult);
    expect(calls.gc).toBe(1);
    expect(calls.leads).toBe(1);
    expect(calls.links).toBe(1);
  });
});

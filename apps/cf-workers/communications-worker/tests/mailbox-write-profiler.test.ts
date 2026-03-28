import { afterEach, describe, expect, it } from "vitest";
import {
  buildMailboxProfilerScenario,
  createLocalProfilerDatabase,
  profileMailboxWriteAmplification,
} from "../src/lib/mailbox-write-profiler";

describe("mailbox-write-profiler", () => {
  let shutdown: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (shutdown) {
      await shutdown();
      shutdown = null;
    }
  });

  it("shows lower write volume on repeat backfill passes", async () => {
    const localDb = await createLocalProfilerDatabase("mailbox-write-profiler-test");
    ({ shutdown } = localDb);

    const report = await profileMailboxWriteAmplification(
      localDb.db,
      buildMailboxProfilerScenario({
        attachmentsPerEmail: 1,
        ccRecipientsPerEmail: 1,
        emailsPerMailbox: 4,
        mailboxEmails: ["chi@desertservices.net", "dawn@desertservices.net"],
        repeatBackfillPasses: 1,
        simulateAttachmentIntake: true,
        simulateBodyLinkScan: true,
        toRecipientsPerEmail: 2,
        uniqueSenderDomains: 2,
        uniqueSenders: 4,
      }),
    );

    expect(report.passes).toHaveLength(2);

    const [freshPass, repeatPass] = report.passes;

    expect(freshPass?.processedEmails).toBe(8);
    expect(freshPass?.attachmentStubs).toBe(8);
    expect(freshPass?.totals.rowsWritten ?? 0).toBeGreaterThan(0);

    expect(repeatPass?.processedEmails).toBe(0);
    expect(repeatPass?.skippedExisting).toBe(8);
    expect(repeatPass?.totals.rowsWritten ?? 0).toBeLessThan(freshPass?.totals.rowsWritten ?? 0);
  });
});

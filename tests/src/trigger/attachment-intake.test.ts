import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntakeAttachmentRow } from "@documents-intake/db/intake-attachments";
import { loadEmailAttachmentBuffer } from "@/apps/trigger-dev/src/trigger/attachment-intake";

function makeRow(
  overrides: Partial<IntakeAttachmentRow> = {}
): IntakeAttachmentRow {
  return {
    attachment_id_pk: 0,
    content_type: "application/pdf",
    conversation_id: null,
    email_id: 0,
    estimate_id: null,
    from_email: null,
    graph_attachment_id: null,
    internet_message_id: null,
    local_path: null,
    mailbox_email: null,
    message_id: null,
    monday_asset_id: null,
    monday_column_id: null,
    monday_item_id: null,
    name: "fixture.pdf",
    project_id: null,
    size: 4,
    source: "email_attachment",
    storage_path: null,
    subject: null,
    thread_id: null,
    ...overrides,
  };
}

describe("loadEmailAttachmentBuffer", () => {
  let fixtureDir = "";
  let fixturePath = "";

  afterEach(async () => {
    if (fixtureDir) {
      await rm(fixtureDir, { force: true, recursive: true });
    }
  });

  test("loads body-link attachments from local storage_path", async () => {
    fixtureDir = join(
      tmpdir(),
      `attachment-intake-test-${crypto.randomUUID().slice(0, 8)}`
    );
    fixturePath = join(fixtureDir, "bodylink-fixture.pdf");
    await Bun.write(fixturePath, new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    const buffer = await loadEmailAttachmentBuffer(
      makeRow({
        graph_attachment_id: "bodylink:onedrive:abc123",
        storage_path: fixturePath,
      })
    );

    expect(buffer.byteLength).toBe(4);
  });

  test("throws a clear error when body-link recovery metadata is missing", async () => {
    fixtureDir = join(
      tmpdir(),
      `attachment-intake-test-${crypto.randomUUID().slice(0, 8)}`
    );

    const row = makeRow({
      graph_attachment_id: "bodylink:dropbox:def456",
      storage_path: join(fixtureDir, "does-not-exist.pdf"),
    });

    await expect(loadEmailAttachmentBuffer(row)).rejects.toThrow(
      "Body-link recovery requires email_id and graph_attachment_id"
    );
  });
});

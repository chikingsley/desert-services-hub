import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { IntakeAttachmentRow } from "@documents-intake/db/intake-attachments";

interface MockState {
  attachments: IntakeAttachmentRow[];
  backfillCalls: Array<{
    documentId: number;
    emailId: number | null;
    graphAttachmentId: string | null;
    projectId: number | null;
  }>;
  deleteFailedCalls: Array<{ emailId: number; graphAttachmentId: string }>;
  graphError: string | null;
  graphGetCalls: string[];
  hashCalls: Array<{ documentId: number; hash: string }>;
  multipartCalls: Array<{ buffer: Buffer; fileName: string }>;
  multipartError: string | null;
  nativeCalls: string[];
  successRows: Record<string, unknown>[];
  updateExtractionCalls: Array<{
    attachmentId: number;
    error: string | null | undefined;
    extractedText: string | null | undefined;
    status: string;
  }>;
}

const state: MockState = {
  attachments: [],
  backfillCalls: [],
  deleteFailedCalls: [],
  graphError: null,
  graphGetCalls: [],
  hashCalls: [],
  multipartError: null,
  nativeCalls: [],
  successRows: [],
  multipartCalls: [],
  updateExtractionCalls: [],
};

function makeRow(
  overrides: Partial<IntakeAttachmentRow> = {}
): IntakeAttachmentRow {
  return {
    attachment_id_pk: 101,
    content_type: "application/pdf",
    conversation_id: null,
    email_id: 777,
    estimate_id: null,
    from_email: "pm@builder.example.com",
    graph_attachment_id: "att-001",
    internet_message_id: "message-123",
    local_path: null,
    mailbox_email: "ops@desertservices.net",
    message_id: "msg-001",
    monday_asset_id: null,
    monday_column_id: null,
    monday_item_id: null,
    name: "proposal.pdf",
    project_id: 444,
    size: 4,
    source: "email_attachment",
    storage_path: null,
    subject: "FW: proposal",
    thread_id: null,
    ...overrides,
  };
}

function installMocks() {
  mock.module("@trigger.dev/sdk", () => ({
    logger: {
      info: () => {},
      warn: () => {},
    },
    schedules: {
      task: <T>(definition: T) => definition,
    },
  }));

  mock.module("@documents-intake/db/attachment", () => ({
    updateAttachmentExtraction: async (
      attachmentId: number,
      status: string,
      extractedText?: string | null,
      error?: string | null
    ) => {
      state.updateExtractionCalls.push({
        attachmentId,
        error,
        extractedText,
        status,
      });
    },
  }));

  mock.module("@documents-intake/db/intake-attachments", () => ({
    deleteFailedParsedDocs: async (
      emailId: number,
      graphAttachmentId: string
    ) => {
      state.deleteFailedCalls.push({ emailId, graphAttachmentId });
    },
    findContentHashAttachmentDuplicate: async () => null,
    findInternetMessageAttachmentDuplicate: async () => null,
    getIntakeAttachmentRows: async () => state.attachments,
    markAttachmentDeduped: async () => {},
    setAttachmentContentHash: async (documentId: number, hash: string) => {
      state.hashCalls.push({ documentId, hash });
    },
    setAttachmentSharePointSource: async () => {},
    updateDocumentBackfillLinks: async (
      documentId: number,
      emailId: number | null,
      graphAttachmentId: string | null,
      projectId: number | null
    ) => {
      state.backfillCalls.push({
        documentId,
        emailId,
        graphAttachmentId,
        projectId,
      });
    },
  }));

  mock.module("@lib/graph/http", () => ({
    graphGet: async (path: string) => {
      state.graphGetCalls.push(path);
      if (state.graphError) {
        throw new Error(state.graphError);
      }
      return {
        contentBytes: Buffer.from([0x25, 0x50, 0x44, 0x46]).toString("base64"),
      };
    },
    graphGetBinary: async () => {
      throw new Error(
        "graphGetBinary should not be called when contentBytes exists"
      );
    },
  }));

  mock.module("@documents-intake/pdf-analysis", () => ({
    nativeExtract: async (filePath: string) => {
      state.nativeCalls.push(filePath);
      throw new Error(
        "nativeExtract should not run when attachment buffer exists"
      );
    },
    nativeExtractMultipart: async (buffer: Buffer, fileName: string) => {
      state.multipartCalls.push({ buffer, fileName });
      if (state.multipartError) {
        throw new Error(state.multipartError);
      }
      return {
        document_type: "contract",
        extracted: { ok: true },
        extraction_method: "multipart",
        filename: fileName,
        metadata: {},
        model: "test-model",
        page_count: 1,
        processing_time_ms: 1,
        summary: "multipart summary",
        text: "multipart text",
      };
    },
  }));

  mock.module("@documents-intake/db/intake-document", () => ({
    INTAKE_LOG_PREFIX: "[intake-test]",
    insertIntakeDocumentFailure: async () => {},
    insertIntakeDocumentSuccess: async (row: Record<string, unknown>) => {
      state.successRows.push(row);
      return 901;
    },
  }));
}

describe("attachmentIntake task", () => {
  beforeEach(() => {
    state.attachments = [];
    state.backfillCalls = [];
    state.deleteFailedCalls = [];
    state.graphError = null;
    state.graphGetCalls = [];
    state.hashCalls = [];
    state.multipartError = null;
    state.nativeCalls = [];
    state.successRows = [];
    state.multipartCalls = [];
    state.updateExtractionCalls = [];
  });

  afterEach(() => {
    mock.restore();
  });

  test("passes downloaded PDF buffers to multipart extraction", async () => {
    installMocks();
    state.attachments = [makeRow()];

    const cacheBuster = `attachment-intake-task-${Date.now()}-${Math.random()}`;
    const { attachmentIntake } = await import(
      `../../../apps/trigger-dev/src/trigger/attachment-intake.ts?${cacheBuster}`
    );

    const run = (
      attachmentIntake as { run: () => Promise<Record<string, number>> }
    ).run;
    const result = await run();

    expect(result).toEqual({
      deduped: 0,
      extracted: 1,
      failed: 0,
      gated: 0,
      notFoundLikeFailures: 0,
      processed: 1,
      providerCapacityGated: false,
      skipped: 0,
      topFailureReasons: [],
    });

    expect(state.graphGetCalls).toEqual([
      "users/ops%40desertservices.net/messages/msg-001/attachments/att-001",
    ]);

    expect(state.multipartCalls).toHaveLength(1);
    expect(state.multipartCalls[0]?.fileName).toBe("proposal.pdf");
    expect(state.multipartCalls[0]?.buffer).toEqual(
      Buffer.from([0x25, 0x50, 0x44, 0x46])
    );
    expect(state.nativeCalls).toHaveLength(0);

    expect(state.successRows).toHaveLength(1);
    expect(state.successRows[0]?.filePath).toBe("proposal.pdf");

    expect(state.hashCalls).toHaveLength(1);
    expect(state.hashCalls[0]?.documentId).toBe(101);
    expect(state.hashCalls[0]?.hash).toHaveLength(64);

    expect(state.deleteFailedCalls).toEqual([
      { emailId: 777, graphAttachmentId: "att-001" },
    ]);
    expect(state.backfillCalls).toEqual([
      {
        documentId: 901,
        emailId: 777,
        graphAttachmentId: "att-001",
        projectId: 444,
      },
    ]);

    expect(state.updateExtractionCalls).toEqual([
      {
        attachmentId: 101,
        error: undefined,
        extractedText: undefined,
        status: "success",
      },
    ]);
  });

  test("marks Graph ErrorItemNotFound attachments as skipped", async () => {
    installMocks();
    state.attachments = [makeRow()];
    state.graphError =
      'Graph API 404: {"error":{"code":"ErrorItemNotFound","message":"The specified object was not found in the store."}}';

    const cacheBuster = `attachment-intake-task-${Date.now()}-${Math.random()}`;
    const { attachmentIntake } = await import(
      `../../../apps/trigger-dev/src/trigger/attachment-intake.ts?${cacheBuster}`
    );

    const run = (
      attachmentIntake as { run: () => Promise<Record<string, number>> }
    ).run;
    const result = await run();

    expect(result).toEqual({
      deduped: 0,
      extracted: 0,
      failed: 0,
      gated: 0,
      notFoundLikeFailures: 0,
      processed: 1,
      providerCapacityGated: false,
      skipped: 1,
      topFailureReasons: [],
    });

    expect(state.updateExtractionCalls).toEqual([
      {
        attachmentId: 101,
        error: "Graph item not found (likely deleted/moved)",
        extractedText: null,
        status: "skipped",
      },
    ]);
  });

  test("skips oversized attachments before download", async () => {
    installMocks();
    state.attachments = [
      makeRow({
        size: 100 * 1024 * 1024,
      }),
    ];

    const cacheBuster = `attachment-intake-task-${Date.now()}-${Math.random()}`;
    const { attachmentIntake } = await import(
      `../../../apps/trigger-dev/src/trigger/attachment-intake.ts?${cacheBuster}`
    );

    const run = (
      attachmentIntake as { run: () => Promise<Record<string, number>> }
    ).run;
    const result = await run();

    expect(result).toEqual({
      deduped: 0,
      extracted: 0,
      failed: 0,
      gated: 0,
      notFoundLikeFailures: 0,
      processed: 1,
      providerCapacityGated: false,
      skipped: 1,
      topFailureReasons: [],
    });

    expect(state.graphGetCalls).toHaveLength(0);
    expect(state.updateExtractionCalls[0]?.status).toBe("skipped");
    expect(state.updateExtractionCalls[0]?.error).toContain(
      "Attachment too large"
    );
  });

  test("gates the batch when provider capacity is exhausted", async () => {
    installMocks();
    state.attachments = [makeRow()];
    state.multipartError =
      'pdf-analysis /native-text-extraction/upload failed (429): {"detail":"All providers failed for \\"chat\\". Errors: local: unavailable | gemini: ClientError: 429 RESOURCE_EXHAUSTED"}';

    const cacheBuster = `attachment-intake-task-${Date.now()}-${Math.random()}`;
    const { attachmentIntake } = await import(
      `../../../apps/trigger-dev/src/trigger/attachment-intake.ts?${cacheBuster}`
    );

    const run = (
      attachmentIntake as { run: () => Promise<Record<string, unknown>> }
    ).run;
    const result = await run();

    expect(result).toMatchObject({
      deduped: 0,
      extracted: 0,
      failed: 0,
      gated: 1,
      notFoundLikeFailures: 0,
      processed: 1,
      providerCapacityGated: true,
      skipped: 0,
    });
    expect(state.updateExtractionCalls).toHaveLength(0);
  });
});

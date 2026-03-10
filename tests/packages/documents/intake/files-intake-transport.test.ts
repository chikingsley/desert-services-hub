import { beforeEach, describe, expect, mock, test } from "bun:test";

interface TransportState {
  failureRows: Record<string, unknown>[];
  multipartCalls: Array<{ buffer: Buffer; fileName: string }>;
  nativeCalls: string[];
  successRows: Record<string, unknown>[];
}

const state: TransportState = {
  failureRows: [],
  multipartCalls: [],
  nativeCalls: [],
  successRows: [],
};

mock.module("@documents-intake/pdf-analysis", () => ({
  nativeExtract: async (filePath: string) => {
    state.nativeCalls.push(filePath);
    return {
      document_type: "contract",
      extracted: { ok: true },
      extraction_method: "native",
      filename: filePath.split("/").pop() ?? filePath,
      metadata: {},
      model: "test-model",
      page_count: 1,
      processing_time_ms: 1,
      summary: "native summary",
      text: "native text",
    };
  },
  nativeExtractMultipart: async (buffer: Buffer, fileName: string) => {
    state.multipartCalls.push({ buffer, fileName });
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
  insertIntakeDocumentFailure: async (row: Record<string, unknown>) => {
    state.failureRows.push(row);
  },
  insertIntakeDocumentSuccess: async (row: Record<string, unknown>) => {
    state.successRows.push(row);
    return 4242;
  },
}));

const { processFilesIntake } = await import("@documents-intake/files-intake");

describe("processFilesIntake transport selection", () => {
  beforeEach(() => {
    state.failureRows = [];
    state.multipartCalls = [];
    state.nativeCalls = [];
    state.successRows = [];
  });

  test("uses multipart extraction when a buffer is provided", async () => {
    const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);

    const results = await processFilesIntake({
      attachmentPaths: ["/tmp/contracts/sample-contract.pdf"],
      attachmentBuffers: [buffer],
      bodyText: "",
      forwarderEmail: "ops@desertservices.net",
      originalFrom: "pm@example.com",
      originalSubject: "FW: sample",
    });

    expect(state.multipartCalls).toHaveLength(1);
    expect(state.multipartCalls[0]?.fileName).toBe("sample-contract.pdf");
    expect(state.multipartCalls[0]?.buffer).toBe(buffer);
    expect(state.nativeCalls).toHaveLength(0);
    expect(state.successRows).toHaveLength(1);
    expect(state.failureRows).toHaveLength(0);
    expect(results[0]?.documentId).toBe(4242);
  });

  test("uses path-based native extraction when no buffer is provided", async () => {
    const filePath = "/tmp/contracts/path-only.pdf";

    const results = await processFilesIntake({
      attachmentPaths: [filePath],
      bodyText: "",
      forwarderEmail: "ops@desertservices.net",
      originalFrom: "pm@example.com",
      originalSubject: "FW: sample",
    });

    expect(state.nativeCalls).toEqual([filePath]);
    expect(state.multipartCalls).toHaveLength(0);
    expect(state.successRows).toHaveLength(1);
    expect(state.failureRows).toHaveLength(0);
    expect(results[0]?.documentId).toBe(4242);
  });
});

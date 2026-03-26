import { afterEach, describe, expect, mock, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const state = {
  fileContent: "",
  filePath: "",
  filePresentDuringRun: false,
  scriptArgs: [] as string[],
  scriptPath: "",
};

function installMocks() {
  mock.module("@trigger.dev/sdk", () => ({
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    schemaTask: <T>(definition: T) => definition,
  }));

  mock.module("@trigger.dev/python", () => ({
    python: {
      runScript: async (scriptPath: string, scriptArgs: string[]) => {
        state.scriptPath = scriptPath;
        state.scriptArgs = scriptArgs;
        state.filePath = scriptArgs[0] ?? "";
        state.filePresentDuringRun = existsSync(state.filePath);
        state.fileContent = readFileSync(state.filePath, "utf8");

        return {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            filename: "sample.pdf",
            content: "# Extracted document text",
            page_count: 2,
            processing_time_ms: 42,
            extraction_method: "native",
            metadata: {},
          }),
        };
      },
    },
  }));
}

describe("documentIntakeParse task", () => {
  afterEach(() => {
    mock.restore();
    state.fileContent = "";
    state.filePath = "";
    state.filePresentDuringRun = false;
    state.scriptArgs = [];
    state.scriptPath = "";
  });

  test("writes a temp file, calls parse.py, and maps JSON output", async () => {
    installMocks();

    const cacheBuster = `document-intake-parse-${Date.now()}-${Math.random()}`;
    const { parseDocument } = await import(
      `../../../apps/trigger-dev/src/trigger/document-intake-parse.ts?${cacheBuster}`
    );

    const result = await parseDocument({
      filename: "nested/path/sample.pdf",
      contentBase64: Buffer.from("hello from trigger").toString("base64"),
    });

    expect(state.scriptPath).toBe(
      "./apps/trigger-dev/src/document-intake/parse.py"
    );
    expect(state.scriptArgs).toEqual([state.filePath]);
    expect(state.filePresentDuringRun).toBe(true);
    expect(state.fileContent).toBe("hello from trigger");
    expect(existsSync(state.filePath)).toBe(false);

    expect(result).toEqual({
      filename: "sample.pdf",
      content: "# Extracted document text",
      pageCount: 2,
      processingTimeMs: 42,
      extractionMethod: "native",
      metadata: {},
    });
  });

  test("task definition exposes the expected id", async () => {
    installMocks();

    const cacheBuster = `document-intake-parse-task-${Date.now()}-${Math.random()}`;
    const { documentIntakeParse } = await import(
      `../../../apps/trigger-dev/src/trigger/document-intake-parse.ts?${cacheBuster}`
    );

    expect((documentIntakeParse as { id?: string }).id).toBe(
      "document-intake-parse"
    );
  });
});

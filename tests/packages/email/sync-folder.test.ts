import { describe, expect, test } from "bun:test";
import { graphEmailToInsertData } from "@email/sync";

describe("graphEmailToInsertData", () => {
  test("includes folder metadata when parent folder is known", () => {
    const data = (
      graphEmailToInsertData as (
        email: Record<string, unknown>,
        mailboxId: number,
        folderNamesById?: Map<string, string>
      ) => Record<string, unknown>
    )(
      {
        id: "graph-message-1",
        subject: "Chandler Bay",
        receivedDateTime: "2026-03-12T22:08:34.000Z",
        parentFolderId: "folder-123",
      },
      7,
      new Map([["folder-123", "CHANDLER BAY"]])
    );

    expect(data).toMatchObject({
      folderId: "folder-123",
      folderName: "CHANDLER BAY",
      mailboxId: 7,
      messageId: "graph-message-1",
    });
  });
});

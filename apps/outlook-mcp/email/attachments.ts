/**
 * Email attachment operations — list and retrieve attachments
 *
 * Graph API endpoints:
 *   GET /users/{mailbox}/messages/{id}/attachments              → list
 *   GET /users/{mailbox}/messages/{id}/attachments/{attachId}/$value → download binary
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ensureAuthenticated } from "@outlook/auth/ensure";
import { callGraphAPI } from "@outlook/utils/graph-api";

const ATTACHMENT_OUTPUT_DIR = "/tmp/outlook-attachments";

interface MCPResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

interface ToolDefinition {
  description: string;
  handler: (args: Record<string, unknown>) => Promise<MCPResponse>;
  inputSchema: {
    type: "object";
    properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
    >;
    required: string[];
    additionalProperties?: boolean;
  };
  name: string;
}

interface GraphAttachment {
  "@odata.type"?: string;
  contentBytes?: string;
  contentType?: string;
  id: string;
  isInline?: boolean;
  name: string;
  size: number;
}

function errorResponse(msg: string): MCPResponse {
  return { content: [{ type: "text", text: msg }], isError: true };
}

function authRequiredResponse(): MCPResponse {
  return errorResponse(
    "Authentication required. Please use the 'authenticate' tool first."
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── list-attachments ────────────────────────────────────────────

interface ListAttachmentsArgs {
  id?: string;
  mailbox?: string;
}

export async function handleListAttachments(
  args: ListAttachmentsArgs
): Promise<MCPResponse> {
  const { mailbox, id } = args;
  if (!mailbox) {
    return errorResponse("Mailbox address is required.");
  }
  if (!id) {
    return errorResponse("Message ID is required.");
  }

  try {
    const accessToken = await ensureAuthenticated();
    const result = await callGraphAPI<{ value: GraphAttachment[] }>(
      accessToken,
      "GET",
      `users/${mailbox}/messages/${id}/attachments`,
      null,
      { $select: "id,name,contentType,size,isInline" }
    );

    const attachments = result.value ?? [];
    if (attachments.length === 0) {
      return {
        content: [{ type: "text", text: "This email has no attachments." }],
      };
    }

    const lines = attachments.map((att, i) => {
      const inline = att.isInline ? " [inline]" : "";
      const type =
        att["@odata.type"]?.replace("#microsoft.graph.", "") ?? "unknown";
      return `${i + 1}. ${att.name}${inline}\n   Type: ${att.contentType ?? type} | Size: ${formatSize(att.size)}\n   ID: ${att.id}`;
    });

    return {
      content: [
        {
          type: "text",
          text: `${attachments.length} attachment(s):\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
      return authRequiredResponse();
    }
    return errorResponse(`Error listing attachments: ${msg}`);
  }
}

// ── get-attachment ──────────────────────────────────────────────

interface GetAttachmentArgs {
  attachmentId?: string;
  id?: string;
  mailbox?: string;
}

/**
 * Downloads an attachment via the Graph API $value endpoint (raw binary),
 * saves to disk, and returns the file path.
 */
export async function handleGetAttachment(
  args: GetAttachmentArgs
): Promise<MCPResponse> {
  const { mailbox, id, attachmentId } = args;
  if (!mailbox) {
    return errorResponse("Mailbox address is required.");
  }
  if (!id) {
    return errorResponse("Message ID is required.");
  }
  if (!attachmentId) {
    return errorResponse("Attachment ID is required.");
  }

  try {
    const accessToken = await ensureAuthenticated();

    // Get metadata first (without contentBytes).
    // Note: @odata.type is always returned automatically — it cannot be in $select.
    const att = await callGraphAPI<GraphAttachment>(
      accessToken,
      "GET",
      `users/${mailbox}/messages/${id}/attachments/${attachmentId}`,
      null,
      { $select: "id,name,contentType,size,isInline" }
    );

    const isFile = att["@odata.type"]?.includes("fileAttachment");
    if (!isFile) {
      const type =
        att["@odata.type"]?.replace("#microsoft.graph.", "") ?? "unknown";
      return {
        content: [
          {
            type: "text",
            text: `Attachment: ${att.name}\nType: ${type}\nThis attachment type does not support binary download.`,
          },
        ],
      };
    }

    // Download raw binary via $value endpoint
    const downloadUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}/$value`;

    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Download failed: ${res.status} ${text}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    // Save to disk
    await mkdir(ATTACHMENT_OUTPUT_DIR, { recursive: true });
    const safeName = att.name.replace(/[^\w.\-()]/g, "_");
    const outputPath = join(ATTACHMENT_OUTPUT_DIR, `${Date.now()}-${safeName}`);
    await Bun.write(outputPath, buffer);

    return {
      content: [
        {
          type: "text",
          text: `Downloaded: ${att.name}\nContent-Type: ${att.contentType ?? "unknown"}\nSize: ${formatSize(buffer.length)}\nSaved to: ${outputPath}`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "Authentication required") {
      return authRequiredResponse();
    }
    return errorResponse(`Error downloading attachment: ${msg}`);
  }
}

// ── Tool definitions ────────────────────────────────────────────

export const attachmentTools: ToolDefinition[] = [
  {
    name: "list-attachments",
    description:
      "Lists all attachments on a specific email. Returns name, type, size, and ID for each attachment.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the email to list attachments for",
        },
      },
      required: ["mailbox", "id"],
      additionalProperties: false,
    },
    handler: handleListAttachments as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "get-attachment",
    description:
      "Downloads a specific attachment from an email. Saves the file to disk and returns the file path. Works with any file size.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Mailbox email address (e.g., 'chi@desertservices.net')",
        },
        id: {
          type: "string",
          description: "ID of the email containing the attachment",
        },
        attachmentId: {
          type: "string",
          description:
            "ID of the attachment to retrieve (from list-attachments)",
        },
      },
      required: ["mailbox", "id", "attachmentId"],
      additionalProperties: false,
    },
    handler: handleGetAttachment as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
];

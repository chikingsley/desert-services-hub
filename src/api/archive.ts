/**
 * Email Archive API
 *
 * Serves downloaded email archives for browsing conversations and attachments.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

const ARCHIVE_DIR = join(process.cwd(), "archives");

interface ConversationMeta {
  conversationId: string;
  subject: string;
  emails: Array<{
    messageId: string;
    from: string;
    to: string[];
    receivedAt: string;
    subject: string;
    bodyPreview: string;
    hasAttachments: boolean;
    attachments: Array<{
      name: string;
      contentType: string;
      size: number;
      localPath?: string;
    }>;
  }>;
  attachmentCount: number;
  firstEmail: string;
  lastEmail: string;
}

interface ArchiveIndex {
  mailbox: string;
  downloadedAt: string;
  dateRange: {
    after: string;
    before: string | null;
  };
  stats: {
    emailsProcessed: number;
    attachmentsDownloaded: number;
    conversationsWithAttachments: number;
  };
  conversations: Array<{
    folder: string;
    subject: string;
    emailCount: number;
    attachmentCount: number;
    dateRange: string;
  }>;
}

/**
 * List available archives (mailboxes)
 */
export async function listArchives(_req: Request): Promise<Response> {
  try {
    const entries = await readdir(ARCHIVE_DIR, { withFileTypes: true });
    const archives = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const indexPath = join(ARCHIVE_DIR, entry.name, "_index.json");
        try {
          const indexData = await readFile(indexPath, "utf-8");
          const index = JSON.parse(indexData) as ArchiveIndex;
          archives.push({
            name: entry.name,
            mailbox: index.mailbox,
            downloadedAt: index.downloadedAt,
            dateRange: index.dateRange,
            stats: index.stats,
          });
        } catch {
          // No index file, skip
        }
      }
    }

    return Response.json({ archives });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ archives: [] });
    }
    throw err;
  }
}

/**
 * Get archive index (list of conversations)
 */
export async function getArchiveIndex(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const archive = url.pathname.split("/")[3]; // /api/archives/:archive

  if (!archive) {
    return Response.json({ error: "Archive name required" }, { status: 400 });
  }

  const indexPath = join(ARCHIVE_DIR, archive, "_index.json");

  try {
    const indexData = await readFile(indexPath, "utf-8");
    const index = JSON.parse(indexData) as ArchiveIndex;
    return Response.json(index);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ error: "Archive not found" }, { status: 404 });
    }
    throw err;
  }
}

/**
 * Get conversation details
 */
export async function getConversation(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const archive = parts[3]; // /api/archives/:archive/conversations/:folder
  const folder = parts[5];

  if (!(archive && folder)) {
    return Response.json(
      { error: "Archive and folder required" },
      { status: 400 }
    );
  }

  const convPath = join(ARCHIVE_DIR, archive, folder, "_conversation.json");

  try {
    const convData = await readFile(convPath, "utf-8");
    const conversation = JSON.parse(convData) as ConversationMeta;
    return Response.json(conversation);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }
    throw err;
  }
}

/**
 * Serve attachment file
 */
export async function getAttachment(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // /api/archives/:archive/conversations/:folder/attachments/:filename
  const archive = parts[3];
  const folder = parts[5];
  const filename = decodeURIComponent(parts[7]);

  if (!(archive && folder && filename)) {
    return Response.json(
      { error: "Archive, folder, and filename required" },
      { status: 400 }
    );
  }

  // Security: prevent directory traversal
  if (
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    return Response.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = join(ARCHIVE_DIR, archive, folder, filename);

  try {
    const fileStats = await stat(filePath);
    const fileData = await readFile(filePath);

    // Determine content type from extension
    const ext = extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
    };

    const contentType = contentTypes[ext] ?? "application/octet-stream";

    return new Response(fileData, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileStats.size.toString(),
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    throw err;
  }
}

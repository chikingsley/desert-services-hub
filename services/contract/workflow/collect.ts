/**
 * Document Collection
 *
 * Gather PDF attachments from census.db and email API,
 * create project folder structure for processing.
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createClient, type GraphEmailClient } from "../../email";
import {
  type Attachment,
  type ContractEmail,
  getContractEmails,
  getContractPDFs,
} from "./queue";

// ============================================
// Types
// ============================================

export interface CollectionResult {
  /** Project folder path */
  projectFolder: string;
  /** Collected PDF files */
  pdfs: CollectedDocument[];
  /** Any errors during collection */
  errors: string[];
  /** Missing documents that need manual handling */
  missing: MissingDocument[];
}

export interface CollectedDocument {
  /** Original filename */
  name: string;
  /** Path where document was saved */
  path: string;
  /** Document type (contract, estimate, po, etc.) */
  type: DocumentType;
  /** Size in bytes */
  size: number;
  /** Whether OCR text is already available */
  hasOcrText: boolean;
  /** Source (email attachment or local) */
  source: "email" | "local" | "docusign";
}

export type DocumentType =
  | "contract"
  | "estimate"
  | "po"
  | "loi"
  | "exhibit"
  | "schedule"
  | "unknown";

export interface MissingDocument {
  type: DocumentType;
  reason: string;
  suggestion: string;
}

export interface CollectionOptions {
  /** Base folder for project documents (default: ground-truth folder) */
  baseFolder?: string;
  /** Download from email API if not in storage (default: true) */
  downloadFromEmail?: boolean;
  /** User email for email API authentication */
  userEmail?: string;
}

// ============================================
// Document Type Detection
// ============================================

/**
 * Detect document type from filename.
 */
export function detectDocumentType(filename: string): DocumentType {
  const lower = filename.toLowerCase();

  if (
    lower.includes("estimate") ||
    lower.includes("quote") ||
    lower.includes("proposal")
  ) {
    return "estimate";
  }

  if (lower.includes("loi") || lower.includes("letter of intent")) {
    return "loi";
  }

  if (lower.includes("po") || lower.includes("purchase order")) {
    return "po";
  }

  if (lower.includes("exhibit")) {
    return "exhibit";
  }

  if (lower.includes("schedule") || lower.includes("timeline")) {
    return "schedule";
  }

  if (
    lower.includes("contract") ||
    lower.includes("subcontract") ||
    lower.includes("agreement") ||
    lower.includes("work order")
  ) {
    return "contract";
  }

  // Default to contract for PDFs in contract emails
  return "unknown";
}

/**
 * Generate a safe folder name from a project name.
 */
export function sanitizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50);
}

// ============================================
// Project Folder Management
// ============================================

/**
 * Create project folder structure.
 */
export function createProjectFolder(
  baseFolder: string,
  projectName: string
): string {
  const folderName = sanitizeFolderName(projectName);
  const projectPath = join(baseFolder, folderName);

  if (!existsSync(projectPath)) {
    mkdirSync(projectPath, { recursive: true });
  }

  return projectPath;
}

/**
 * Get the default base folder for ground-truth documents.
 */
export function getDefaultBaseFolder(): string {
  return join(import.meta.dir, "../ground-truth");
}

// ============================================
// Document Collection
// ============================================

/**
 * Collect all documents for a contract from email attachments.
 */
export async function collectDocuments(
  normalizedSubject: string,
  options: CollectionOptions = {}
): Promise<CollectionResult> {
  const baseFolder = options.baseFolder ?? getDefaultBaseFolder();
  const downloadFromEmail = options.downloadFromEmail ?? true;

  const result: CollectionResult = {
    projectFolder: "",
    pdfs: [],
    errors: [],
    missing: [],
  };

  // Create project folder
  const projectName = normalizedSubject;
  result.projectFolder = createProjectFolder(baseFolder, projectName);

  // Get attachments from census.db
  const attachments = getContractPDFs(normalizedSubject);

  if (attachments.length === 0) {
    result.errors.push("No PDF attachments found in census.db");
    result.missing.push({
      type: "contract",
      reason: "No PDFs attached to emails in this thread",
      suggestion:
        "Check if contract was sent via DocuSign link - forward the DocuSign email to yourself to get the PDF",
    });
    return result;
  }

  // Get emails for downloading
  const emails = getContractEmails(normalizedSubject);
  const emailMap = new Map<number, ContractEmail>();
  for (const email of emails) {
    emailMap.set(email.id, email);
  }

  // Initialize email client if downloading
  let emailClient: GraphEmailClient | null = null;
  if (downloadFromEmail) {
    try {
      emailClient = createClient();
      emailClient.initAppAuth();
    } catch (error) {
      result.errors.push(`Failed to initialize email client: ${error}`);
    }
  }

  // Process each attachment
  for (const attachment of attachments) {
    const targetPath = join(result.projectFolder, attachment.name);

    // Check if already exists locally
    if (existsSync(targetPath)) {
      const stats = Bun.file(targetPath);
      result.pdfs.push({
        name: attachment.name,
        path: targetPath,
        type: detectDocumentType(attachment.name),
        size: attachment.size ?? 0,
        hasOcrText: !!attachment.extractedText,
        source: "local",
      });
      continue;
    }

    // Try to download from email API
    if (emailClient && options.userEmail) {
      const email = emailMap.get(attachment.emailId);
      if (email) {
        try {
          const content = await emailClient.downloadAttachment(
            email.messageId,
            getAttachmentIdFromCensus(attachment),
            options.userEmail
          );

          writeFileSync(targetPath, content);

          result.pdfs.push({
            name: attachment.name,
            path: targetPath,
            type: detectDocumentType(attachment.name),
            size: content.length,
            hasOcrText: !!attachment.extractedText,
            source: "email",
          });
        } catch (error) {
          result.errors.push(`Failed to download ${attachment.name}: ${error}`);
        }
      }
    } else if (attachment.storagePath) {
      // Try to copy from storage path
      if (existsSync(attachment.storagePath)) {
        const content = await Bun.file(attachment.storagePath).arrayBuffer();
        writeFileSync(targetPath, Buffer.from(content));

        result.pdfs.push({
          name: attachment.name,
          path: targetPath,
          type: detectDocumentType(attachment.name),
          size: content.byteLength,
          hasOcrText: !!attachment.extractedText,
          source: "local",
        });
      } else {
        result.errors.push(
          `Storage path not found for ${attachment.name}: ${attachment.storagePath}`
        );
      }
    } else {
      result.errors.push(
        `Cannot collect ${attachment.name}: no storage path and email download not configured`
      );
    }
  }

  // Check for missing document types
  const collectedTypes = new Set(result.pdfs.map((p) => p.type));

  if (!(collectedTypes.has("contract") || collectedTypes.has("po"))) {
    result.missing.push({
      type: "contract",
      reason: "No contract or PO document identified",
      suggestion:
        "One of the PDFs may be the contract - check filenames or this may be a DocuSign",
    });
  }

  if (!collectedTypes.has("estimate")) {
    result.missing.push({
      type: "estimate",
      reason: "No estimate document found",
      suggestion: "Get estimate from Monday ESTIMATING board or QuickBooks",
    });
  }

  return result;
}

/**
 * Get attachment ID from census record.
 * Census stores the Graph API attachment ID.
 */
function getAttachmentIdFromCensus(attachment: Attachment): string {
  // The census stores attachment_id which is the Graph API attachment ID
  const db = new Database(
    join(import.meta.dir, "../../email/census/census.db"),
    { readonly: true }
  );

  try {
    const row = db
      .query<{ attachment_id: string }, [number]>(
        "SELECT attachment_id FROM attachments WHERE id = ?"
      )
      .get(attachment.id);

    return row?.attachment_id ?? "";
  } finally {
    db.close();
  }
}

/**
 * Add a local PDF to the project folder.
 * Use this for manually downloaded files (e.g., from DocuSign).
 */
export function addLocalDocument(
  projectFolder: string,
  sourcePath: string,
  documentType?: DocumentType
): CollectedDocument {
  const filename = basename(sourcePath);
  const targetPath = join(projectFolder, filename);

  if (!existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  // Copy if not already in project folder
  if (sourcePath !== targetPath) {
    const content = Bun.file(sourcePath);
    Bun.write(targetPath, content);
  }

  const stats = Bun.file(targetPath);

  return {
    name: filename,
    path: targetPath,
    type: documentType ?? detectDocumentType(filename),
    size: stats.size,
    hasOcrText: false,
    source: "local",
  };
}

/**
 * List all PDFs in a project folder.
 */
export function listProjectDocuments(
  projectFolder: string
): CollectedDocument[] {
  if (!existsSync(projectFolder)) {
    return [];
  }

  const files = readdirSync(projectFolder).filter((f) =>
    f.toLowerCase().endsWith(".pdf")
  );

  return files.map((filename) => {
    const path = join(projectFolder, filename);
    const stats = Bun.file(path);

    return {
      name: filename,
      path,
      type: detectDocumentType(filename),
      size: stats.size,
      hasOcrText: false, // Would need to check against census
      source: "local" as const,
    };
  });
}

// ============================================
// Display Helpers
// ============================================

/**
 * Format collection result for display.
 */
export function formatCollectionResult(result: CollectionResult): string {
  const lines: string[] = [];

  lines.push("# Document Collection");
  lines.push(`Folder: ${result.projectFolder}`);
  lines.push("");

  if (result.pdfs.length > 0) {
    lines.push(`## Collected Documents (${result.pdfs.length})`);
    lines.push("");
    for (const pdf of result.pdfs) {
      const ocr = pdf.hasOcrText ? "✓ OCR" : "⏳ needs OCR";
      const size = `${Math.round(pdf.size / 1024)}KB`;
      lines.push(`- [${pdf.type}] ${pdf.name} (${size}) ${ocr}`);
    }
    lines.push("");
  }

  if (result.missing.length > 0) {
    lines.push("## Missing Documents");
    lines.push("");
    for (const m of result.missing) {
      lines.push(`- [${m.type}] ${m.reason}`);
      lines.push(`  → ${m.suggestion}`);
    }
    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push("## Errors");
    lines.push("");
    for (const e of result.errors) {
      lines.push(`- ${e}`);
    }
  }

  return lines.join("\n");
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
    case "collect": {
      const subject = args.slice(1).join(" ");
      if (!subject) {
        console.error("Usage: collect.ts collect <normalized subject>");
        process.exit(1);
      }

      console.log(`Collecting documents for: ${subject}`);

      const result = await collectDocuments(subject, {
        downloadFromEmail: false, // Don't download by default (needs auth)
      });

      console.log(formatCollectionResult(result));
      break;
    }

    case "add": {
      const [folder, sourcePath] = args.slice(1);
      if (!(folder && sourcePath)) {
        console.error("Usage: collect.ts add <project-folder> <source-path>");
        process.exit(1);
      }

      const doc = addLocalDocument(folder, sourcePath);
      console.log(`Added: ${doc.name} as ${doc.type}`);
      break;
    }

    case "list": {
      const folder = args[1];
      if (!folder) {
        console.error("Usage: collect.ts list <project-folder>");
        process.exit(1);
      }

      const docs = listProjectDocuments(folder);
      console.log(`Documents in ${folder}:`);
      for (const doc of docs) {
        console.log(`- [${doc.type}] ${doc.name}`);
      }
      break;
    }

    default:
      console.log(`
Document Collection Commands:

  bun services/contract/workflow/collect.ts collect <subject>
    Collect PDFs for a contract thread

  bun services/contract/workflow/collect.ts add <folder> <path>
    Add a local PDF to a project folder

  bun services/contract/workflow/collect.ts list <folder>
    List documents in a project folder
      `);
  }
}

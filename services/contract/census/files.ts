/**
 * Utilities for downloading attachments from MinIO to local filesystem
 *
 * Usage:
 *   import { downloadAttachment, downloadProjectFiles } from '@/services/contract/census/files';
 *
 *   // Download single attachment by ID
 *   await downloadAttachment(12345, 'output/contract.pdf');
 *
 *   // Download all attachments for a project to a folder
 *   await downloadProjectFiles('Elanto at Prasada', 'services/contract/ground-truth/elanto/');
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUCKETS, getFile } from "@/lib/minio";
import { getAttachmentById, searchAttachments } from "./db";

// Re-export Attachment type for convenience
export type { Attachment } from "./db";

/**
 * Download a single attachment by ID to a local path
 */
export async function downloadAttachment(
  attachmentId: number,
  outputPath: string
): Promise<void> {
  const att = getAttachmentById(attachmentId);
  if (!att) {
    throw new Error(`Attachment ${attachmentId} not found`);
  }
  if (!att.storagePath) {
    throw new Error(`Attachment ${attachmentId} has no storage_path`);
  }

  const content = await getFile(BUCKETS.EMAIL_ATTACHMENTS, att.storagePath);

  // Ensure directory exists
  const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, Buffer.from(content));
}

/**
 * Download an attachment and return its content as Uint8Array
 */
export async function getAttachmentContent(
  attachmentId: number
): Promise<Uint8Array> {
  const att = getAttachmentById(attachmentId);
  if (!att) {
    throw new Error(`Attachment ${attachmentId} not found`);
  }
  if (!att.storagePath) {
    throw new Error(`Attachment ${attachmentId} has no storage_path`);
  }

  return await getFile(BUCKETS.EMAIL_ATTACHMENTS, att.storagePath);
}

/**
 * Download attachment directly using storage path (skip DB lookup)
 */
export async function downloadFromStoragePath(
  storagePath: string,
  outputPath: string
): Promise<void> {
  const content = await getFile(BUCKETS.EMAIL_ATTACHMENTS, storagePath);

  const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, Buffer.from(content));
}

/**
 * Safe filename - replace special chars with underscores
 */
function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
}

/**
 * Download all PDF attachments matching a project/contractor search to a folder
 * Returns list of downloaded file paths
 */
export async function downloadProjectFiles(
  searchTerm: string,
  outputFolder: string,
  options: {
    pdfOnly?: boolean;
    dedupe?: boolean;
  } = {}
): Promise<string[]> {
  const { pdfOnly = true, dedupe = true } = options;

  // Search for attachments
  const attachments = searchAttachments(searchTerm);

  // Filter to PDFs if requested
  const filtered = pdfOnly
    ? attachments.filter(
        (a) =>
          a.name.toLowerCase().endsWith(".pdf") ||
          a.contentType?.includes("pdf")
      )
    : attachments;

  // Ensure output folder exists
  if (!existsSync(outputFolder)) {
    mkdirSync(outputFolder, { recursive: true });
  }

  const downloaded: string[] = [];
  const seenNames = new Set<string>();

  for (const att of filtered) {
    if (!att.storagePath) {
      continue;
    }

    // Skip duplicates by name
    if (dedupe && seenNames.has(att.name)) {
      continue;
    }
    seenNames.add(att.name);

    try {
      const safeName = safeFilename(att.name);
      const outputPath = join(outputFolder, safeName);

      // If file exists with same name, add suffix
      let finalPath = outputPath;
      if (existsSync(outputPath)) {
        const ext = safeName.substring(safeName.lastIndexOf("."));
        const base = safeName.substring(0, safeName.lastIndexOf("."));
        finalPath = join(outputFolder, `${base}_${att.id}${ext}`);
      }

      const content = await getFile(BUCKETS.EMAIL_ATTACHMENTS, att.storagePath);
      writeFileSync(finalPath, Buffer.from(content));
      downloaded.push(finalPath);
    } catch (error) {
      console.error(`Failed to download ${att.name}:`, error);
    }
  }

  return downloaded;
}

/**
 * Download specific attachments by ID list to a folder
 */
export async function downloadAttachmentsToFolder(
  attachmentIds: number[],
  outputFolder: string
): Promise<string[]> {
  if (!existsSync(outputFolder)) {
    mkdirSync(outputFolder, { recursive: true });
  }

  const downloaded: string[] = [];

  for (const id of attachmentIds) {
    const att = getAttachmentById(id);
    if (!att?.storagePath) {
      continue;
    }

    try {
      const safeName = safeFilename(att.name);
      const outputPath = join(outputFolder, safeName);

      const content = await getFile(BUCKETS.EMAIL_ATTACHMENTS, att.storagePath);
      writeFileSync(outputPath, Buffer.from(content));
      downloaded.push(outputPath);
    } catch (error) {
      console.error(`Failed to download attachment ${id}:`, error);
    }
  }

  return downloaded;
}

export type { Attachment };

/**
 * Shared helpers for email CLI commands.
 */

export interface FileAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
}

/**
 * Loads files from disk as base64-encoded attachments.
 * Exits the process if any file is not found.
 */
export async function loadFileAttachments(
  commaSeparatedPaths: string
): Promise<FileAttachment[]> {
  const attachments: FileAttachment[] = [];
  const paths = commaSeparatedPaths.split(",").map((p) => p.trim());

  for (const filePath of paths) {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      console.error(`Attachment not found: ${filePath}`);
      process.exit(1);
    }
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const fileName = filePath.split("/").pop() ?? "attachment";
    attachments.push({
      name: fileName,
      contentType: file.type || "application/octet-stream",
      contentBytes: base64,
    });
    console.log(`  Attached: ${fileName}`);
  }

  return attachments;
}

#!/usr/bin/env bun
/**
 * Fetch all documents associated with BAZ2502 project
 */

import { Database } from "bun:sqlite";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUCKETS, getFile } from "../../../lib/minio";

const PROJECT_FOLDER = join(import.meta.dir, "BAZ2502-Cambridge-Construction");

async function main() {
  // Connect to database
  const db = new Database(join(import.meta.dir, "../census/census.db"));

  console.log("Fetching all BAZ2502 project documents...\n");

  // Get all attachments for BAZ2502 emails
  const attachments = db
    .query<
      {
        id: number;
        email_id: number;
        name: string;
        storage_path: string | null;
        content_type: string | null;
        size: number | null;
        subject: string;
        received_at: string;
      },
      []
    >(
      `SELECT 
        a.id,
        a.email_id,
        a.name,
        a.storage_path,
        a.content_type,
        a.size,
        e.subject,
        e.received_at
      FROM attachments a
      JOIN emails e ON a.email_id = e.id
      WHERE e.subject LIKE '%BAZ2502%'
      ORDER BY e.received_at DESC, a.name`
    )
    .all();

  console.log(`Found ${attachments.length} attachments\n`);

  // Track downloaded files to avoid duplicates
  const downloadedFiles = new Set<string>();
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const att of attachments) {
    // Skip if we've already downloaded this exact file
    if (downloadedFiles.has(att.name)) {
      console.log(`⏭️  Skipping duplicate: ${att.name}`);
      skipCount++;
      continue;
    }

    // Skip if no storage path (can't download)
    if (!att.storage_path) {
      console.log(`⚠️  No storage path for: ${att.name}`);
      skipCount++;
      continue;
    }

    try {
      console.log(`📥 Downloading: ${att.name} (${(att.size || 0) / 1024}KB)`);

      const content = await getFile(
        BUCKETS.EMAIL_ATTACHMENTS,
        att.storage_path
      );

      // Create a safe filename (remove special chars, handle duplicates)
      const safeName = att.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/\s+/g, "_");

      const outputPath = join(PROJECT_FOLDER, safeName);

      // If file exists, add timestamp to avoid overwrite
      if (existsSync(outputPath)) {
        const ext = safeName.substring(safeName.lastIndexOf("."));
        const base = safeName.substring(0, safeName.lastIndexOf("."));
        const timestamp = new Date(att.received_at).toISOString().split("T")[0];
        const newName = `${base}_${timestamp}${ext}`;
        writeFileSync(join(PROJECT_FOLDER, newName), Buffer.from(content));
        console.log(`   ✓ Saved as: ${newName}`);
      } else {
        writeFileSync(outputPath, Buffer.from(content));
        console.log(`   ✓ Saved as: ${safeName}`);
      }

      downloadedFiles.add(att.name);
      successCount++;
    } catch (error) {
      console.error(`   ✗ Error downloading ${att.name}:`, error);
      errorCount++;
    }
  }

  // Create a summary file
  const summary = {
    project:
      "BAZ2502 - Cambridge Construction - City of Scottsdale Transfer Station",
    fetchedAt: new Date().toISOString(),
    totalAttachments: attachments.length,
    downloaded: successCount,
    skipped: skipCount,
    errors: errorCount,
    files: Array.from(downloadedFiles).sort(),
  };

  writeFileSync(
    join(PROJECT_FOLDER, "SUMMARY.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log("\n✅ Complete!");
  console.log(`   Downloaded: ${successCount}`);
  console.log(`   Skipped: ${skipCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Location: ${PROJECT_FOLDER}`);

  db.close();
}

main().catch(console.error);

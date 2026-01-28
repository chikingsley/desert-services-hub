#!/usr/bin/env bun
/**
 * Fetch the actual dust permit PDFs from Maricopa County for Sun Health RGS
 */

import { Database } from "bun:sqlite";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUCKETS, getFile } from "../../../lib/minio";

// Top-level regex patterns for performance
const PERMIT_APPLICATION_PATTERN = /application (D\d+)/;
const FACILITY_ID_PATTERN = /Facility ID#: (F\d+)/;
const FACILITY_NAME_PATTERN = /Facility Name: ([^\n]+)/;
const FACILITY_ADDRESS_PATTERN = /Facility Address: ([^\n]+)/;

const PROJECT_FOLDER = join(
  import.meta.dir,
  "Sun-Health-RGS-Dust-Control-Permit"
);

async function main() {
  // Connect to database
  const db = new Database(join(import.meta.dir, "../census/census.db"));

  console.log(
    "Fetching Sun Health RGS dust permit PDFs from Maricopa County...\n"
  );

  // Get permit PDFs - there are TWO permits issued!
  const _permitEmails = [370, 3457, 277, 3453]; // Email IDs for the permit issued emails

  const attachments = db
    .query<
      {
        id: number;
        email_id: number;
        name: string;
        storage_path: string | null;
        subject: string;
        body_preview: string;
        received_at: string;
      },
      []
    >(
      `SELECT 
        a.id,
        a.email_id,
        a.name,
        a.storage_path,
        e.subject,
        e.body_preview,
        e.received_at
      FROM attachments a
      JOIN emails e ON a.email_id = e.id
      WHERE e.id IN (370, 3457, 277, 3453)
      AND a.name LIKE '%.pdf%'
      ORDER BY e.received_at DESC`
    )
    .all();

  console.log(`Found ${attachments.length} permit PDFs\n`);

  const downloadedFiles: string[] = [];

  for (const att of attachments) {
    if (!att.storage_path) {
      console.log(`⚠️  No storage path for: ${att.name}`);
      continue;
    }

    try {
      // Extract permit details from email body
      const permitMatch = att.body_preview.match(PERMIT_APPLICATION_PATTERN);
      const facilityMatch = att.body_preview.match(FACILITY_ID_PATTERN);
      const nameMatch = att.body_preview.match(FACILITY_NAME_PATTERN);

      const permitNum = permitMatch ? permitMatch[1] : "unknown";
      const facilityId = facilityMatch ? facilityMatch[1] : "unknown";
      const facilityName = nameMatch
        ? nameMatch[1].trim().replace(/[^a-zA-Z0-9\s-]/g, "_")
        : "Sun_Health_RGS";

      console.log(`📥 Downloading: ${att.name}`);
      console.log(`   Permit: ${permitNum}, Facility: ${facilityId}`);

      const content = await getFile(
        BUCKETS.EMAIL_ATTACHMENTS,
        att.storage_path
      );

      // Create descriptive filename
      const date = new Date(att.received_at).toISOString().split("T")[0];
      const safeName = `${facilityName}_Permit_${permitNum}_${facilityId}_${date}.pdf`;
      const outputPath = join(PROJECT_FOLDER, safeName);

      writeFileSync(outputPath, Buffer.from(content));
      console.log(`   ✓ Saved as: ${safeName}\n`);

      downloadedFiles.push(safeName);
    } catch (error) {
      console.error(`   ✗ Error downloading ${att.name}:`, error);
    }
  }

  // Get full email details for summary
  const emails = db
    .query<
      {
        id: number;
        subject: string;
        body_preview: string;
        received_at: string;
        to_emails: string;
      },
      []
    >(
      `SELECT id, subject, body_preview, received_at, to_emails
       FROM emails
       WHERE id IN (370, 3457, 277, 3453)
       ORDER BY received_at ASC`
    )
    .all();

  console.log(`✅ Complete! Downloaded ${downloadedFiles.length} permit PDFs`);
  console.log(`   Location: ${PROJECT_FOLDER}\n`);

  // Print permit details
  console.log("Permit Details:");
  for (const email of emails) {
    const permitMatch = email.body_preview.match(PERMIT_APPLICATION_PATTERN);
    const facilityMatch = email.body_preview.match(FACILITY_ID_PATTERN);
    const nameMatch = email.body_preview.match(FACILITY_NAME_PATTERN);
    const addressMatch = email.body_preview.match(FACILITY_ADDRESS_PATTERN);

    console.log(`\n  Permit: ${permitMatch?.[1] || "N/A"}`);
    console.log(`  Facility: ${nameMatch?.[1]?.trim() || "N/A"}`);
    console.log(`  Facility ID: ${facilityMatch?.[1] || "N/A"}`);
    console.log(`  Address: ${addressMatch?.[1]?.trim() || "N/A"}`);
    console.log(`  Issued: ${email.received_at.split("T")[0]}`);
    console.log(`  Email ID: ${email.id}`);
  }

  db.close();
}

main().catch(console.error);

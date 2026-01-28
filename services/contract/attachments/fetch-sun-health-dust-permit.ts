#!/usr/bin/env bun
/**
 * Fetch all documents related to Sun Health RGS Dust Control Permit
 */

import { Database } from "bun:sqlite";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUCKETS, getFile } from "../../../lib/minio";

const PROJECT_FOLDER = join(
  import.meta.dir,
  "Sun-Health-RGS-Dust-Control-Permit"
);

async function main() {
  // Connect to database
  const db = new Database(join(import.meta.dir, "../census/census.db"));

  console.log("Fetching Sun Health RGS Dust Control Permit documents...\n");

  // Get all attachments for Sun Health RGS dust/duct control permit emails
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
      WHERE (e.subject LIKE '%Sun Health RGS%Duct%' 
         OR e.subject LIKE '%Sun Health RGS%Dust%'
         OR e.subject LIKE '%Sun Health%Dust Permit%'
         OR (e.subject LIKE '%Sun Health%' AND e.subject LIKE '%permit%'))
      AND a.storage_path IS NOT NULL
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

    try {
      console.log(`📥 Downloading: ${att.name} (${(att.size || 0) / 1024}KB)`);

      if (!att.storage_path) {
        console.log(`⚠️  No storage path for: ${att.name}`);
        continue;
      }

      const content = await getFile(
        BUCKETS.EMAIL_ATTACHMENTS,
        att.storage_path
      );

      // Create a safe filename
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

  // Get email timeline
  const emails = db
    .query<
      {
        id: number;
        subject: string;
        from_name: string;
        from_email: string;
        to_emails: string;
        cc_emails: string;
        received_at: string;
      },
      []
    >(
      `SELECT id, subject, from_name, from_email, to_emails, cc_emails, received_at
       FROM emails
       WHERE subject LIKE '%Sun Health RGS%Duct%' 
          OR subject LIKE '%Sun Health RGS%Dust%'
          OR subject LIKE '%Sun Health%Dust Permit%'
          OR (subject LIKE '%Sun Health%' AND subject LIKE '%Dust%' AND subject LIKE '%Permit%')
       ORDER BY received_at ASC`
    )
    .all();

  // Create timeline summary
  const timeline = emails.map((e) => ({
    date: e.received_at,
    subject: e.subject,
    from: e.from_name || e.from_email,
    to: e.to_emails,
    cc: e.cc_emails,
  }));

  // Create summary file
  const summary = {
    project: "Sun Health RGS - Dust Control Permit",
    fetchedAt: new Date().toISOString(),
    totalAttachments: attachments.length,
    downloaded: successCount,
    skipped: skipCount,
    errors: errorCount,
    files: Array.from(downloadedFiles).sort(),
    timeline,
    billingCommunication: {
      sentToBilling: false,
      note: "Billing notification sent Dec 22, 2025, but only to chi@desertservices.net (self). NOT sent to Kendra or Jayson/Jason.",
      billingEmails: emails
        .filter((e) => e.subject.includes("Dust Permit Ready for Billing"))
        .map((e) => ({
          date: e.received_at,
          subject: e.subject,
          to: e.to_emails,
          cc: e.cc_emails,
        })),
    },
  };

  writeFileSync(
    join(PROJECT_FOLDER, "SUMMARY.json"),
    JSON.stringify(summary, null, 2)
  );

  // Create README
  const readme = `# Sun Health RGS - Dust Control Permit

## Project Documents

This folder contains all documents related to the Sun Health RGS Dust Control Permit.

## Timeline

${timeline.map((e) => `- **${e.date.split("T")[0]}** - ${e.subject} (From: ${e.from})`).join("\n")}

## Key Dates

- **Dec 11, 2025** - Initial dust control permit request from PWI (David Mueller)
- **Dec 12, 2025** - Permit documents forwarded (SWPPP PDF included)
- **Dec 22, 2025** - Dust permit submitted to Maricopa County ($1,070)
- **Dec 22, 2025** - Billing notification sent (⚠️ Only to Chi, NOT to Kendra/Jason)
- **Dec 23, 2025** - Permit received from Jose Olivas (GCon)
- **Dec 24, 2025** - Follow-up emails from Jayson Roti

## Billing Communication Status

⚠️ **NOT SENT TO BILLING TEAM**

The billing notification "Dust Permit Ready for Billing: SUN HEALTH" was sent on **December 22, 2025** but:
- **Sent TO:** chi@desertservices.net (Chi sent to himself)
- **NOT sent to:** Kendra Ash or Jayson/Jason Roti
- **Permit Cost:** $570 + $500 = $1,070

Other dust permit billing notifications from the same day WERE sent to billing team members (Kendra, Jayson), but the Sun Health one was not.

## Permit Details

- **Project:** Sun Health RGS (Resident Gathering Space)
- **PWI Job No:** 25-014
- **Account:** PWI Residential
- **Permit Cost:** $1,070 ($570 + $500)
- **Status:** Submitted to Maricopa County
- **Application #:** (not provided in email)
- **Permit # (Facility ID):** Pending

## Documents Included

${Array.from(downloadedFiles)
  .map((f) => `- ${f}`)
  .join("\n")}

---

*Documents fetched on: ${new Date().toISOString().split("T")[0]}*
`;

  writeFileSync(join(PROJECT_FOLDER, "README.md"), readme);

  console.log("\n✅ Complete!");
  console.log(`   Downloaded: ${successCount}`);
  console.log(`   Skipped: ${skipCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Location: ${PROJECT_FOLDER}`);
  console.log(
    "\n⚠️  BILLING NOTE: Billing notification was NOT sent to Kendra or Jason/Jayson"
  );

  db.close();
}

main().catch(console.error);

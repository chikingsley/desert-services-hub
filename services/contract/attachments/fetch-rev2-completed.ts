#!/usr/bin/env bun
/**
 * Fetch the completed REV 2 BAZ2502 contract PDF
 * Email ID: 39009
 * Subject: Completed: "Subcontract Agreement_Desert Services, LLC- REV 2- BAZ2502"
 */

import { Database } from "bun:sqlite";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUCKETS, getFile } from "../../../lib/minio";
import { GraphEmailClient } from "../../email/client";

const EMAIL_ID = 39_009;
const OUTPUT_DIR = import.meta.dir;

async function main() {
  // Connect to database
  const db = new Database(join(import.meta.dir, "../census/census.db"));

  // Get email details
  const email = db
    .query<
      {
        id: number;
        message_id: string;
        subject: string;
        mailbox_id: number;
      },
      [number]
    >("SELECT id, message_id, subject, mailbox_id FROM emails WHERE id = ?")
    .get(EMAIL_ID);

  if (!email) {
    console.error(`Email ${EMAIL_ID} not found`);
    process.exit(1);
  }

  // Get mailbox email
  const mailbox = db
    .query<{ email: string }, [number]>(
      "SELECT email FROM mailboxes WHERE id = ?"
    )
    .get(email.mailbox_id);

  if (!mailbox) {
    console.error(`Mailbox ${email.mailbox_id} not found`);
    process.exit(1);
  }

  console.log(`Fetching attachments for: ${email.subject}`);
  console.log(`Message ID: ${email.message_id}`);
  console.log(`Mailbox: ${mailbox.email}`);

  // Check if attachment exists in database
  const attachments = db
    .query<
      {
        id: number;
        name: string;
        storage_path: string | null;
        attachment_id: string;
      },
      [number]
    >(
      "SELECT id, name, storage_path, attachment_id FROM attachments WHERE email_id = ?"
    )
    .all(EMAIL_ID);

  console.log(`Found ${attachments.length} attachments in database`);

  if (attachments.length === 0) {
    // Try to fetch from email API
    console.log(
      "\nNo attachments in database. Attempting to fetch from email API..."
    );

    try {
      const client = new GraphEmailClient({
        azureTenantId: process.env.AZURE_TENANT_ID ?? "",
        azureClientId: process.env.AZURE_CLIENT_ID ?? "",
        azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
      });
      client.initAppAuth();
      const emailAttachments = await client.getAttachments(
        email.message_id,
        mailbox.email
      );

      console.log(`Found ${emailAttachments.length} attachments in email`);

      for (const att of emailAttachments) {
        if (att.name.toLowerCase().endsWith(".pdf")) {
          console.log(`Downloading: ${att.name}`);
          const content = await client.downloadAttachment(
            email.message_id,
            att.id,
            mailbox.email
          );

          const outputPath = join(
            OUTPUT_DIR,
            "Subcontract_Agreement_Desert_Services_LLC_REV2_BAZ2502_Completed.pdf"
          );
          writeFileSync(outputPath, content);
          console.log(`✓ Saved to: ${outputPath}`);
          break; // Just get the first PDF
        }
      }
    } catch (error) {
      console.error("Error fetching from email API:", error);
      console.log("\nTrying to check MinIO storage...");

      // Check if there's a stored version from earlier emails
      // Prioritize: REV 2 contract PDFs, then any contract PDFs (excluding estimates)
      let earlierAttachments = db
        .query<
          {
            name: string;
            storage_path: string;
          },
          []
        >(
          `SELECT a.name, a.storage_path FROM attachments a
           JOIN emails e ON a.email_id = e.id
           WHERE e.subject LIKE '%BAZ2502%' 
           AND e.subject LIKE '%REV 2%'
           AND a.name LIKE '%.pdf%'
           AND a.storage_path IS NOT NULL
           AND a.name NOT LIKE '%Est_%'
           AND a.name NOT LIKE '%Estimate%'
           ORDER BY e.received_at DESC
           LIMIT 1`
        )
        .get();

      // If no REV 2 contract attachment, try any BAZ2502 contract PDF (excluding estimates)
      if (!earlierAttachments) {
        earlierAttachments = db
          .query<
            {
              name: string;
              storage_path: string;
            },
            []
          >(
            `SELECT a.name, a.storage_path FROM attachments a
             JOIN emails e ON a.email_id = e.id
             WHERE e.subject LIKE '%BAZ2502%'
             AND (e.subject LIKE '%Subcontract%' OR e.subject LIKE '%Contract%' OR a.name LIKE '%Cambridge%')
             AND a.name LIKE '%.pdf%'
             AND a.storage_path IS NOT NULL
             AND a.name NOT LIKE '%Est_%'
             AND a.name NOT LIKE '%Estimate%'
             ORDER BY e.received_at DESC
             LIMIT 1`
          )
          .get();
      }

      if (earlierAttachments?.storage_path) {
        console.log(`Found contract PDF: ${earlierAttachments.name}`);
        console.log(`Storage path: ${earlierAttachments.storage_path}`);

        try {
          const content = await getFile(
            BUCKETS.EMAIL_ATTACHMENTS,
            earlierAttachments.storage_path
          );

          const outputPath = join(
            OUTPUT_DIR,
            "Subcontract_Agreement_Desert_Services_LLC_REV2_BAZ2502_Completed.pdf"
          );
          writeFileSync(outputPath, Buffer.from(content));
          console.log(`✓ Saved to: ${outputPath}`);
          console.log(
            "Note: This is the contract PDF from the signature request."
          );
          console.log(
            "The completed version may need to be downloaded from Adobe Sign directly."
          );
        } catch (minioError) {
          console.error("Error fetching from MinIO:", minioError);
          console.log(
            "\nMinIO may not be accessible. The completed PDF may need to be downloaded"
          );
          console.log(
            "manually from the Adobe Sign completion email or web interface."
          );
        }
      } else {
        console.log("No contract PDF found in storage.");
        console.log(
          "The completed PDF may need to be downloaded manually from Adobe Sign."
        );
      }
    }
  } else {
    // Download from MinIO if available
    for (const att of attachments) {
      if (att.storage_path && att.name.toLowerCase().endsWith(".pdf")) {
        console.log(`Downloading from MinIO: ${att.name}`);
        try {
          const content = await getFile(
            BUCKETS.EMAIL_ATTACHMENTS,
            att.storage_path
          );

          const outputPath = join(
            OUTPUT_DIR,
            "Subcontract_Agreement_Desert_Services_LLC_REV2_BAZ2502_Completed.pdf"
          );
          writeFileSync(outputPath, Buffer.from(content));
          console.log(`✓ Saved to: ${outputPath}`);
          break;
        } catch (error) {
          console.error(`Error downloading ${att.name}:`, error);
        }
      }
    }
  }

  db.close();
}

main().catch(console.error);

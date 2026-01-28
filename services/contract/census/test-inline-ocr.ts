/**
 * Test script: OCR inline image attachments
 *
 * Downloads an inline image from an email and runs Mistral OCR on it.
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { GraphEmailClient } from "../../email/client";

const dbPath = join(import.meta.dir, "census.db");
const db = new Database(dbPath);

// Email ID with the inline signature image (Rogue Force)
const TEST_EMAIL_ID = 86_722;

async function main() {
  console.log("=".repeat(60));
  console.log("INLINE IMAGE OCR TEST");
  console.log("=".repeat(60));

  // 1. Get email info from database
  const email = db
    .query<
      {
        id: number;
        message_id: string;
        subject: string;
        from_email: string;
        body_html: string;
      },
      [number]
    >(
      "SELECT id, message_id, subject, from_email, body_html FROM emails WHERE id = ?"
    )
    .get(TEST_EMAIL_ID);

  if (!email) {
    console.error(`Email ${TEST_EMAIL_ID} not found`);
    return;
  }

  console.log(`\nEmail: ${email.subject}`);
  console.log(`From: ${email.from_email}`);

  // 2. Get inline image attachments
  const attachments = db
    .query<
      {
        id: number;
        attachment_id: string;
        name: string;
        content_type: string;
        size: number;
      },
      [number]
    >(
      `SELECT id, attachment_id, name, content_type, size 
       FROM attachments 
       WHERE email_id = ? AND content_type LIKE '%image%'`
    )
    .all(TEST_EMAIL_ID);

  console.log(`\nInline image attachments: ${attachments.length}`);
  for (const att of attachments) {
    console.log(`  - ${att.name} (${att.content_type}, ${att.size} bytes)`);
  }

  if (attachments.length === 0) {
    console.log("No inline images found");
    return;
  }

  // 3. Find which mailbox this email is in
  const mailbox = db
    .query<{ email: string }, [number]>(
      `SELECT m.email FROM mailboxes m 
       JOIN emails e ON e.mailbox_id = m.id 
       WHERE e.id = ?`
    )
    .get(TEST_EMAIL_ID);

  if (!mailbox) {
    console.error("Could not find mailbox for email");
    return;
  }

  console.log(`\nMailbox: ${mailbox.email}`);

  // 4. Initialize Graph client
  const client = new GraphEmailClient({
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  });
  client.initAppAuth();

  // 5. Process each inline image (limit to first 3 to keep test fast)
  const imagesToProcess = attachments.slice(0, 3);

  for (const imageAtt of imagesToProcess) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Downloading: ${imageAtt.name} (${imageAtt.size} bytes)...`);

    try {
      const imageBuffer = await client.downloadAttachment(
        email.message_id,
        imageAtt.attachment_id,
        mailbox.email
      );

      console.log(`Downloaded ${imageBuffer.length} bytes`);

      // Save to temp file for OCR
      const tempPath = join(import.meta.dir, `temp_${imageAtt.name}`);
      await Bun.write(tempPath, imageBuffer);

      // Call Mistral OCR
      console.log("Running OCR...");

      const proc = Bun.spawn(
        [
          "uv",
          "run",
          "--directory",
          join(import.meta.dir, "../../mistral"),
          "python",
          "-c",
          `
import asyncio
from mistral_mcp.client import MistralClient

async def ocr_image():
    client = MistralClient()
    result = await client.ocr_from_file("${tempPath}")
    for page in result.pages:
        print(page.markdown)

asyncio.run(ocr_image())
          `,
        ],
        {
          cwd: join(import.meta.dir, "../../mistral"),
          env: { ...process.env },
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (stderr && !stderr.includes("INFO") && stderr.trim()) {
        console.error("OCR Error:", stderr.slice(0, 200));
      }

      console.log(`\n📝 EXTRACTED TEXT from ${imageAtt.name}:`);
      console.log("─".repeat(40));
      console.log(stdout.trim() || "(no text extracted)");

      // Clean up temp file
      try {
        await Bun.$`rm ${tempPath}`;
      } catch {
        // Ignore cleanup errors
      }
    } catch (error) {
      console.error(
        `Error processing ${imageAtt.name}:`,
        String(error).slice(0, 200)
      );
    }
  }

  // Show where this would be inserted in the body
  console.log(`\n${"=".repeat(60)}`);
  console.log("CID references in HTML:");
  const cidMatches = email.body_html.matchAll(/src="cid:([^"]+)"/g);
  for (const match of cidMatches) {
    console.log(`  - cid:${match[1]}`);
  }
  console.log("\nThese would be replaced with OCR'd text in body_full.");
}

main();

/**
 * Validation script: Test OCR on diverse sample of inline images
 *
 * This helps validate that we're:
 * 1. Extracting useful content from images that have it
 * 2. Correctly identifying images to skip (logos, icons)
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { GraphEmailClient } from "../../email/client";

const dbPath = join(import.meta.dir, "census.db");
const db = new Database(dbPath);

// Regex patterns (module-level for performance)
const RE_PHONE = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/;
const RE_EMAIL = /@[a-z0-9.-]+\.[a-z]{2,}/i;
const RE_ADDRESS =
  /\d+\s+[a-z]+\s+(st|street|ave|avenue|blvd|rd|road|dr|drive)/i;
const RE_NAME_PATTERN = /[A-Z][a-z]+\s+[A-Z][a-z]+/;
const RE_WHITESPACE_SPLIT = /\s+/;

// Sample larger signature-style images (40-80KB) - more likely to have contact info
const TEST_SAMPLES = [
  {
    att_id: 24_454,
    name: "image006.png",
    from: "rreyes@weoneil.com (Rina Reyes)",
    size: 77_702,
  },
  {
    att_id: 3203,
    name: "image002.png",
    from: "kelli@sandstormsign.com",
    size: 72_791,
  },
  {
    att_id: 1719,
    name: "image009.png",
    from: "Crystel.Barrios@tdc-properties.com",
    size: 71_662,
  },
  {
    att_id: 4196,
    name: "image002.png",
    from: "james@westates.us (James Leonard)",
    size: 70_736,
  },
  {
    att_id: 7519,
    name: "image006.png",
    from: "SLaw@nrpgroup.com (Scott Law)",
    size: 54_773,
  },
  {
    att_id: 31_507,
    name: "image001.png",
    from: "admin@rogueforce.com",
    size: 73_991,
  },
];

interface AttachmentInfo {
  attachment_id: string;
  email_id: number;
  message_id: string;
  mailbox: string;
}

async function ocrImage(imagePath: string): Promise<string> {
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
    result = await client.ocr_from_file("${imagePath}")
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
  return stdout.trim();
}

function categorizeContent(text: string): {
  category: string;
  useful: boolean;
} {
  const lower = text.toLowerCase();

  // Check for contact info patterns
  const hasPhone = RE_PHONE.test(text);
  const hasEmail = RE_EMAIL.test(text);
  const hasAddress = RE_ADDRESS.test(text);

  // Check for name patterns (Title Case words)
  const _hasName = RE_NAME_PATTERN.test(text);

  if (hasPhone || hasEmail) {
    return { category: "CONTACT_INFO", useful: true };
  }

  if (hasAddress) {
    return { category: "ADDRESS", useful: true };
  }

  // Logo/branding patterns
  if (lower.includes("logo") || text.length < 50) {
    return { category: "LOGO/SHORT", useful: false };
  }

  // Company name only
  if (text.split(RE_WHITESPACE_SPLIT).length < 10 && !hasPhone && !hasEmail) {
    return { category: "COMPANY_NAME", useful: false };
  }

  return { category: "OTHER", useful: text.length > 20 };
}

async function main() {
  console.log("=".repeat(70));
  console.log("INLINE IMAGE OCR VALIDATION");
  console.log("Testing 10 diverse external sender images");
  console.log("=".repeat(70));

  // Initialize Graph client
  const client = new GraphEmailClient({
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  });
  client.initAppAuth();

  const results: Array<{
    from: string;
    name: string;
    size: number;
    text: string;
    category: string;
    useful: boolean;
  }> = [];

  for (const sample of TEST_SAMPLES) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(
      `Testing: ${sample.name} from ${sample.from} (${sample.size} bytes)`
    );

    // Get attachment details
    const attInfo = db
      .query<AttachmentInfo, [number]>(
        `SELECT a.attachment_id, a.email_id, e.message_id, m.email as mailbox
         FROM attachments a
         JOIN emails e ON a.email_id = e.id
         JOIN mailboxes m ON e.mailbox_id = m.id
         WHERE a.id = ?`
      )
      .get(sample.att_id);

    if (!attInfo) {
      console.log("  ⚠️  Attachment not found");
      continue;
    }

    try {
      // Download image
      const imageBuffer = await client.downloadAttachment(
        attInfo.message_id,
        attInfo.attachment_id,
        attInfo.mailbox
      );

      const tempPath = join(
        import.meta.dir,
        `temp_validate_${sample.att_id}.png`
      );
      await Bun.write(tempPath, imageBuffer);

      // OCR
      const text = await ocrImage(tempPath);
      const { category, useful } = categorizeContent(text);

      results.push({
        from: sample.from,
        name: sample.name,
        size: sample.size,
        text: text.slice(0, 200),
        category,
        useful,
      });

      const icon = useful ? "✅" : "⏭️";
      console.log(`  ${icon} Category: ${category}`);
      console.log(
        `  📝 Text: ${text.slice(0, 100).replace(/\n/g, " ")}${text.length > 100 ? "..." : ""}`
      );

      // Cleanup
      try {
        await Bun.$`rm ${tempPath}`;
      } catch {
        // Ignore cleanup errors
      }
    } catch (error) {
      console.log(`  ❌ Error: ${String(error).slice(0, 100)}`);
      results.push({
        from: sample.from,
        name: sample.name,
        size: sample.size,
        text: "ERROR",
        category: "ERROR",
        useful: false,
      });
    }
  }

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY");
  console.log("=".repeat(70));

  const useful = results.filter((r) => r.useful);
  const skippable = results.filter((r) => !r.useful);

  console.log(
    `\n✅ USEFUL (would extract): ${useful.length}/${results.length}`
  );
  for (const r of useful) {
    console.log(`   - ${r.from}: ${r.category}`);
  }

  console.log(`\n⏭️  SKIP (logos/short): ${skippable.length}/${results.length}`);
  for (const r of skippable) {
    console.log(`   - ${r.from}: ${r.category} - "${r.text.slice(0, 50)}..."`);
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log("RECOMMENDATION:");
  if (useful.length > skippable.length) {
    console.log("  Most images contain useful content - worth processing!");
  } else {
    console.log("  Most images are logos/branding - filtering helps!");
  }
}

main();

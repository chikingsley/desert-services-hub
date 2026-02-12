/**
 * Bulk File Download
 *
 * Iterates through all estimates in Supabase Postgres (already synced) and downloads
 * any files from Monday that we don't have yet. No full-board re-fetch --
 * uses local item IDs, calls processItemFiles per-item.
 *
 * Run inside Docker: bun apps/web/bulk-download.ts
 */
import { db } from "@lib/db/hub";
import { processItemFiles } from "@/apps/web/pipeline";

const SKIP_GROUPS = new Set([
  "Shell Estimates ( Do Not Move)",
  "Sales Team Estimates",
]);

async function main(): Promise<void> {
  const items = await db
    .query<{
      monday_item_id: string;
      name: string;
      group_title: string | null;
    }>("SELECT monday_item_id, name, group_title FROM estimates ORDER BY id")
    .all();

  const eligible = items.filter(
    (item) => !SKIP_GROUPS.has(item.group_title ?? "")
  );
  console.log(`[bulk] ${eligible.length} estimates to check for files`);

  let downloaded = 0;
  let withNewFiles = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < eligible.length; i++) {
    const item = eligible[i];
    const progress = `[${i + 1}/${eligible.length}]`;

    try {
      const count = await processItemFiles(item.monday_item_id);
      if (count > 0) {
        downloaded += count;
        withNewFiles++;
        console.log(`${progress} ${item.name}: ${count} file(s)`);
      } else {
        skipped++;
        if ((i + 1) % 200 === 0) {
          console.log(`${progress} ...checked ${i + 1} items so far`);
        }
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${progress} ${item.name}: ERROR - ${msg}`);
    }
  }

  console.log("\n[bulk] Done!");
  console.log(`  Items with new files: ${withNewFiles}`);
  console.log(`  Total files downloaded: ${downloaded}`);
  console.log(`  Already up-to-date / no files: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((err) => {
  console.error("[bulk] Fatal:", err);
  process.exit(1);
});

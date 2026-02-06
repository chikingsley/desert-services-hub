/**
 * Sync Permits Command
 *
 * Sync permit data from CSV exports to SQLite databases.
 *
 * Usage:
 *   bun src/cli.ts sync
 */

import { defineCommand } from "citty";
import { syncPermits } from "@/handlers/sync";
import { outputArgs } from "./_shared/output";

export { syncSchema } from "@/handlers/sync";

export default defineCommand({
  meta: {
    name: "sync",
    description:
      "Sync permit data from CSV exports or portal downloads into SQLite",
  },
  args: {
    ...outputArgs,
  },
  async run({ args }) {
    const result = await syncPermits({});

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!result.success) {
      console.error(`\n❌ SYNC FAILED: ${result.error}\n`);
      process.exit(1);
    }
  },
});

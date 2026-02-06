/**
 * List Permits Command
 *
 * List permits from the database.
 *
 * Usage:
 *   bun src/cli.ts list
 *   bun src/cli.ts list --status expiring
 *   bun src/cli.ts list --company CMP005052
 *   bun src/cli.ts list --permit D0063581
 */

import { defineCommand } from "citty";
import { formatTable, outputArgs } from "@/commands/_shared/output";
import { listPermits } from "@/handlers/list";

export { listSchema } from "@/handlers/list";

export default defineCommand({
  meta: {
    name: "list",
    description: "List permits from the database",
  },
  args: {
    status: {
      type: "string",
      alias: "s",
      description: "Filter: active (default), expiring, or all",
    },
    company: {
      type: "string",
      alias: "c",
      description: "Filter by company ID (e.g., CMP005052)",
    },
    permit: {
      type: "string",
      alias: "p",
      description: "Get a single permit by ID (e.g., D0063581)",
    },
    days: {
      type: "string",
      alias: "d",
      description: "Days for expiring filter (default: 30)",
    },
    ...outputArgs,
  },
  run({ args }) {
    const status = args.status as "active" | "expiring" | "all" | undefined;
    const expiringDays = args.days ? Number.parseInt(args.days, 10) : undefined;

    const result = listPermits({
      status,
      companyId: args.company,
      permitId: args.permit,
      expiringDays,
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!result.success) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    if (result.count === 0) {
      console.log(`No permits found (filter: ${result.filter})`);
      return;
    }

    console.log(`\nPermits (${result.count}, filter: ${result.filter}):\n`);

    // Format permits for display
    const rows = result.permits.map((p) => ({
      ID: p.id,
      Status: p.status ?? "-",
      Company: p.companyName?.slice(0, 25) ?? "-",
      Project: p.projectName?.slice(0, 30) ?? "-",
      Expires: p.expirationDate ?? "-",
    }));

    console.log(formatTable(rows));
  },
});

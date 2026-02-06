/**
 * Close Permit Command
 *
 * Close an existing dust permit.
 *
 * Usage:
 *   bun src/cli.ts close D0056240
 *   bun src/cli.ts close D0056240 --reason "Project complete"
 *   bun src/cli.ts close D0056240 --headed
 */

import { defineCommand } from "citty";
import { headlessArgs, resolveHeadless } from "@/commands/_shared/headless";
import { outputArgs } from "@/commands/_shared/output";
import { closePermit } from "@/handlers/close";

export { closeSchema } from "@/handlers/close";

export default defineCommand({
  meta: {
    name: "close",
    description: "Close an existing dust permit",
  },
  args: {
    permitId: {
      type: "positional",
      required: true,
      description: "Permit ID to close (e.g., D0056240)",
    },
    reason: {
      type: "string",
      alias: "r",
      description: "Reason for closing the permit",
      default: "Project complete - closing permit",
    },
    ...headlessArgs,
    ...outputArgs,
  },
  async run({ args }) {
    const headless = resolveHeadless(args);

    // Progress callback for non-JSON output
    const onProgress = args.json
      ? undefined
      : (step: number, total: number, message: string) => {
          console.log(`[${step}/${total}] ${message}`);
        };

    if (!args.json) {
      console.log(`\n=== CLOSING PERMIT: ${args.permitId} ===\n`);
    }

    const result = await closePermit(
      {
        permitId: args.permitId,
        reason: args.reason,
        headless,
      },
      onProgress
    );

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.success) {
      console.log(
        `\n=== ✓ PERMIT ${result.permitId} CLOSED SUCCESSFULLY ===\n`
      );
    } else {
      console.error(`\n❌ CLOSE FAILED: ${result.error}\n`);
      process.exit(1);
    }
  },
});

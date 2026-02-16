/**
 * Delete Drafts Command
 *
 * Delete draft dust permit applications.
 *
 * Usage:
 *   bun src/cli.ts delete --all
 *   bun src/cli.ts delete --all --headed
 */

import { defineCommand } from "citty";
import { headlessArgs, resolveHeadless } from "@/commands/_shared/headless";
import { outputArgs } from "@/commands/_shared/output";
import { deleteDrafts } from "@/handlers/delete";

export { deleteSchema } from "@/handlers/delete";

export default defineCommand({
  args: {
    all: {
      type: "boolean",
      alias: "a",
      required: true,
      description: "Delete all draft applications (required for safety)",
    },
    ...headlessArgs,
    ...outputArgs,
  },
  meta: {
    name: "delete",
    description: "Delete draft dust permit applications",
  },
  async run({ args }) {
    const headless = resolveHeadless(args);

    const result = await deleteDrafts({
      all: args.all,
      headless,
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!result.success) {
      console.error(`\n❌ DELETE FAILED: ${result.error}\n`);
      process.exit(1);
    }
  },
});

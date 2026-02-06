/**
 * Renew Permit Command
 *
 * Renew an existing dust permit by creating a new application that
 * copies from the existing permit.
 *
 * Usage:
 *   bun src/cli.ts renew D0058823 --company "Weis Builders Inc"
 *   bun src/cli.ts renew D0058823 -c "Weis Builders Inc" --headed
 *   bun src/cli.ts renew D0058823 -c "Weis Builders Inc" --formData ./overrides.json
 */

import { defineCommand } from "citty";
import { headlessArgs, resolveHeadless } from "@/commands/_shared/headless";
import { outputArgs } from "@/commands/_shared/output";
import { renewPermit } from "@/handlers/renew";

export { renewSchema } from "@/handlers/renew";

export default defineCommand({
  meta: {
    name: "renew",
    description:
      "Renew an existing dust permit by copying to a new application",
  },
  args: {
    permitId: {
      type: "positional",
      required: true,
      description: "Permit ID to renew (e.g., D0058823)",
    },
    company: {
      type: "string",
      alias: "c",
      required: true,
      description: "Company name (exact match required)",
    },
    formData: {
      type: "string",
      alias: "f",
      description: "Path to JSON file with FormData overrides",
    },
    keepOpen: {
      type: "boolean",
      alias: "k",
      default: false,
      description: "Keep browser open after completion for manual review",
    },
    ...headlessArgs,
    ...outputArgs,
  },
  async run({ args }) {
    const headless = resolveHeadless(args);

    if (!args.json) {
      console.log(`\n=== RENEWING PERMIT: ${args.permitId} ===`);
      console.log(`    Company: ${args.company}\n`);
    }

    const result = await renewPermit({
      permitId: args.permitId,
      companyName: args.company,
      formDataPath: args.formData,
      headless,
      keepOpen: args.keepOpen,
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.success) {
      console.log(`\n=== ✓ RENEWAL READY: ${result.newApplicationId} ===`);
      console.log(`    Copied from: ${result.permitId}`);
      console.log(`    Company: ${result.companyName}\n`);
    } else {
      console.error(`\n❌ RENEWAL FAILED: ${result.error}\n`);
      process.exit(1);
    }
  },
});

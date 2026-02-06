/**
 * Revise Permit Command
 *
 * Revise an existing dust permit (edit in-place, does NOT extend expiration).
 *
 * Usage:
 *   bun src/cli.ts revise D0058823 --type boundary
 *   bun src/cli.ts revise D0058823 --type acreage --notes "Increased to 5 acres"
 *   bun src/cli.ts revise D0058823 --type contact --formData ./overrides.json
 */

import { defineCommand } from "citty";
import { headlessArgs, resolveHeadless } from "@/commands/_shared/headless";
import { outputArgs } from "@/commands/_shared/output";
import { type RevisionType, revisePermit } from "@/handlers/revise";

export { reviseSchema } from "@/handlers/revise";

const VALID_REVISION_TYPES = [
  "boundary",
  "acreage",
  "contact",
  "schedule",
  "bmp",
  "other",
] as const;

export default defineCommand({
  meta: {
    name: "revise",
    description:
      "Revise an existing dust permit (edit in-place, does NOT extend expiration)",
  },
  args: {
    permitId: {
      type: "positional",
      required: true,
      description: "Permit ID to revise (e.g., D0058823)",
    },
    type: {
      type: "string",
      alias: "t",
      required: true,
      description:
        "Revision type: boundary, acreage, contact, schedule, bmp, or other",
    },
    notes: {
      type: "string",
      alias: "n",
      description: "Additional notes about the revision",
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
    const revisionType = args.type as RevisionType;
    const headless = resolveHeadless(args);

    // Validate revision type
    if (!VALID_REVISION_TYPES.includes(revisionType)) {
      console.error(
        `Error: --type must be one of: ${VALID_REVISION_TYPES.join(", ")}`
      );
      process.exit(1);
    }

    if (!args.json) {
      console.log(`\n=== REVISING PERMIT ${args.permitId} ===`);
      console.log(`    Type: ${revisionType}`);
      if (args.notes) {
        console.log(`    Notes: ${args.notes}`);
      }
      console.log("");
    }

    const result = await revisePermit({
      permitId: args.permitId,
      revisionType,
      notes: args.notes,
      formDataPath: args.formData,
      headless,
      keepOpen: args.keepOpen,
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.success) {
      console.log("\n=== ✓ REVISION CREATED ===");
      console.log(`    Permit: ${result.permitId}`);
      console.log(`    Type: ${result.revisionType}`);
      console.log(`    New Application: ${result.newApplicationId}\n`);
    } else {
      console.error(`\n❌ REVISION FAILED: ${result.error}\n`);
      process.exit(1);
    }
  },
});

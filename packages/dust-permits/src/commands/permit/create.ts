/**
 * Create Permit Command
 *
 * Create a new dust permit application.
 *
 * Usage:
 *   bun src/cli.ts create --flow new-company --form-data ./data.json
 *   bun src/cli.ts create --flow existing-company --company "Sundt Construction"
 */

import { defineCommand } from "citty";
import { headlessArgs, resolveHeadless } from "@/commands/_shared/headless";
import { outputArgs } from "@/commands/_shared/output";
import { createPermit } from "@/handlers/create";

export { createSchema } from "@/handlers/create";

export default defineCommand({
  args: {
    flow: {
      type: "string",
      alias: "f",
      required: true,
      description: "Flow type: new-company or existing-company",
    },
    company: {
      type: "string",
      alias: "c",
      description: "Company name (required for existing-company flow)",
    },
    formData: {
      type: "string",
      alias: "d",
      description: "Path to JSON file with FormData overrides",
    },
    keepOpen: {
      type: "boolean",
      alias: "k",
      default: false,
      description: "Keep browser open after completion for manual review",
    },
    allowFullParcelDraw: {
      type: "boolean",
      default: false,
      description:
        "Bypass acreage-ratio guardrail and auto-draw the full assessor parcel on map",
    },
    ...headlessArgs,
    ...outputArgs,
  },
  meta: {
    name: "create",
    description: "Create a new dust permit application",
  },
  async run({ args }) {
    const flow = args.flow as "new-company" | "existing-company";
    const headless = resolveHeadless(args);

    // Validate flow
    if (flow !== "new-company" && flow !== "existing-company") {
      console.error(
        "Error: --flow must be 'new-company' or 'existing-company'"
      );
      process.exit(1);
    }

    if (args.allowFullParcelDraw) {
      process.env.PERMIT_ALLOW_FULL_PARCEL_DRAW = "1";
    }

    // Progress callback for non-JSON output
    const onProgress = args.json
      ? undefined
      : (step: number, total: number, message: string) => {
          console.log(`[${step}/${total}] ${message}`);
        };

    if (!args.json) {
      console.log("\n=== CREATING PERMIT APPLICATION ===");
      console.log(`    Flow: ${flow}`);
      if (args.company) {
        console.log(`    Company: ${args.company}`);
      }
      if (args.formData) {
        console.log(`    FormData: ${args.formData}`);
      }
      if (args.allowFullParcelDraw) {
        console.log("    Map Override: full parcel draw enabled");
      }
      console.log("");
    }

    const result = await createPermit(
      {
        flow,
        companyName: args.company,
        formDataPath: args.formData,
        headless,
        keepOpen: args.keepOpen,
      },
      undefined,
      onProgress
    );

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.success) {
      console.log("\n=== ✓ APPLICATION CREATED ===");
      console.log(`    Application ID: ${result.applicationId}`);
      console.log(`    Flow: ${result.flow}`);
      if (result.reachedPage5) {
        console.log("    Status: Ready to submit on Page 5\n");
      } else {
        console.log("    Status: Needs manual review\n");
      }
    } else {
      console.error(`\n❌ CREATE FAILED: ${result.error}\n`);
      process.exit(1);
    }
  },
});

#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { z } from "zod";
import { die, ensureDir, formatZodError, resolvePath } from "../src/common";
import type { GenerateEstimatePdfResult } from "../src/quoting/generate";
import { generateEstimatePdfById } from "../src/quoting/generate";
import type { GeneratePdfResult as SdsGenerateResult } from "../src/safety/sds/generate";
import { generatePdf as generateSdsPdf } from "../src/safety/sds/generate";
import { templateDoc as sdsTemplateDoc } from "../src/safety/sds/template";
import type { SsspGenerateOverrides } from "../src/safety/sssp/generate";
import {
  generatePdf as generateSsspPdf,
  parseSsspSectionsOverride,
} from "../src/safety/sssp/generate";
import { templateDoc as ssspTemplateDoc } from "../src/safety/sssp/template";
import { generatePdf as generateNoiNdcQuickstart } from "../src/stormwater/noi-ndc-quickstart";
import { generatePdf as generateNoiSimpleGuide } from "../src/stormwater/noi-simple-guide";

type SafetyDocKind = "sds" | "sssp";
type SafetyAction = "init" | "generate";
type QuotingKind = "estimate";
type QuotingAction = "generate" | "pdf";
type StormwaterKind = "noi-guide" | "quickstart";

function isSafetyDocKind(value: string): value is SafetyDocKind {
  return value === "sds" || value === "sssp";
}

function isSafetyAction(value: string): value is SafetyAction {
  return value === "init" || value === "generate";
}

function isQuotingKind(value: string): value is QuotingKind {
  return value === "estimate";
}

function isQuotingAction(value: string): value is QuotingAction {
  return value === "generate" || value === "pdf";
}

function isStormwaterKind(value: string): value is StormwaterKind {
  return value === "noi-guide" || value === "quickstart";
}

function help(): void {
  console.log(`
Desert PDF Generation CLI

Usage:
  bun packages/documents/pdf-generation-cli/cli/cli.ts safety sssp init <output.json>
  bun packages/documents/pdf-generation-cli/cli/cli.ts safety sssp generate --in <input.json> --out <output.pdf> [--sections <all|comma-list>]

  bun packages/documents/pdf-generation-cli/cli/cli.ts safety sds init <output.json>
  bun packages/documents/pdf-generation-cli/cli/cli.ts safety sds generate --in <input.json> --out <output.pdf> [--include-sheets] [--download-sheets-from-url] [--fail-on-missing-sheets]

  bun packages/documents/pdf-generation-cli/cli/cli.ts quoting estimate generate --id <estimate-id> [--output <output.pdf>] [--include-back-page]

  bun packages/documents/pdf-generation-cli/cli/cli.ts stormwater noi-guide generate --out <output.pdf>
  bun packages/documents/pdf-generation-cli/cli/cli.ts stormwater quickstart generate --out <output.pdf>
`);
}

async function handleSafetyInit(
  kind: SafetyDocKind,
  argv: string[]
): Promise<void> {
  const outputPath = argv[0];
  if (!outputPath) {
    die(`init requires an output path: safety ${kind} init <output.json>`);
  }

  const outPath = resolvePath(outputPath);
  const template = kind === "sds" ? sdsTemplateDoc() : ssspTemplateDoc();

  ensureDir(outPath);
  await Bun.write(outPath, `${JSON.stringify(template, null, 2)}\n`);
  console.log(`Wrote template JSON: ${outPath}`);
}

const ssspGenerateSchema = z
  .object({
    in: z.string().trim().min(1),
    out: z.string().trim().min(1),
    sections: z.string().trim().optional(),
  })
  .strict();

async function handleSafetySsspGenerate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      in: { type: "string" },
      out: { type: "string" },
      sections: { type: "string" },
    },
  });

  const parsed = ssspGenerateSchema.safeParse(values);
  if (!parsed.success) {
    die(`Invalid safety sssp generate args: ${formatZodError(parsed.error)}`);
  }

  const inPath = resolvePath(parsed.data.in);
  const outPath = resolvePath(parsed.data.out);

  const overrides: SsspGenerateOverrides = {};
  if (parsed.data.sections !== undefined) {
    overrides.sections = parseSsspSectionsOverride(parsed.data.sections);
  }

  ensureDir(outPath);
  await generateSsspPdf(inPath, outPath, overrides);
  console.log(`Wrote PDF: ${outPath}`);
}

async function handleSafetySdsGenerate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "download-sheets-from-url": { type: "boolean", default: false },
      "fail-on-missing-sheets": { type: "boolean", default: false },
      in: { type: "string" },
      "include-sheets": { type: "boolean", default: false },
      out: { type: "string" },
    },
  });

  const inPath = values.in ? resolvePath(values.in) : null;
  const outPath = values.out ? resolvePath(values.out) : null;
  if (!(inPath && outPath)) {
    die("generate requires --in <input.json> --out <output.pdf>");
  }

  ensureDir(outPath);
  const result: SdsGenerateResult = await generateSdsPdf(inPath, outPath, {
    downloadSheetsFromUrl: values["download-sheets-from-url"],
    failOnMissingSheets: values["fail-on-missing-sheets"],
    includeSheets: values["include-sheets"],
  });

  console.log(`Wrote PDF: ${outPath}`);
  if (values["include-sheets"]) {
    console.log(
      `Sheets included: ${result.sheetsIncluded}, skipped: ${result.sheetsSkipped}`
    );
  }
}

async function handleSafetyGenerate(
  kind: SafetyDocKind,
  argv: string[]
): Promise<void> {
  if (kind === "sds") {
    await handleSafetySdsGenerate(argv);
    return;
  }

  await handleSafetySsspGenerate(argv);
}

const quotingEstimateGenerateSchema = z
  .object({
    backpage: z.boolean().optional(),
    id: z.string().trim().min(1),
    "include-back-page": z.boolean().optional(),
    output: z.string().trim().min(1).optional(),
  })
  .strict();

async function handleQuotingEstimateGenerate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      backpage: { type: "boolean", default: false },
      id: { type: "string" },
      "include-back-page": { type: "boolean", default: false },
      output: { type: "string" },
    },
  });

  const parsed = quotingEstimateGenerateSchema.safeParse(values);
  if (!parsed.success) {
    die(
      `Invalid quoting estimate generate args: ${formatZodError(parsed.error)}`
    );
  }

  const includeBackPage =
    parsed.data["include-back-page"] || parsed.data.backpage;
  const outputPath = parsed.data.output
    ? resolvePath(parsed.data.output)
    : undefined;

  if (outputPath) {
    ensureDir(outputPath);
  }

  const result: GenerateEstimatePdfResult = await generateEstimatePdfById(
    parsed.data.id,
    {
      includeBackPage,
      outputPath,
    }
  );

  console.log(`Wrote PDF: ${result.outputPath}`);
}

async function handleStormwaterGenerate(
  kind: StormwaterKind,
  argv: string[]
): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: "string" },
    },
  });

  const outPath = values.out ? resolvePath(values.out) : null;
  if (!outPath) {
    die(`stormwater ${kind} generate requires --out <output.pdf>`);
  }

  ensureDir(outPath);

  if (kind === "noi-guide") {
    await generateNoiSimpleGuide(outPath);
  } else {
    await generateNoiNdcQuickstart(outPath);
  }

  console.log(`Wrote PDF: ${outPath}`);
}

async function main(): Promise<void> {
  const [domain, kindArg, actionArg, ...rest] = Bun.argv.slice(2);

  if (!domain || domain === "--help" || domain === "-h") {
    help();
    process.exit(0);
  }

  if (domain === "safety") {
    if (!(kindArg && isSafetyDocKind(kindArg))) {
      die("Missing or invalid document type. Expected one of: sssp, sds");
    }

    if (!(actionArg && isSafetyAction(actionArg))) {
      die("Missing or invalid action. Expected one of: init, generate");
    }

    if (actionArg === "init") {
      await handleSafetyInit(kindArg, rest);
      process.exit(0);
    }

    await handleSafetyGenerate(kindArg, rest);
    process.exit(0);
  }

  if (domain === "quoting") {
    if (!(kindArg && isQuotingKind(kindArg))) {
      die("Missing or invalid quoting type. Expected: estimate");
    }

    if (!(actionArg && isQuotingAction(actionArg))) {
      die("Missing or invalid quoting action. Expected one of: generate, pdf");
    }

    await handleQuotingEstimateGenerate(rest);
    process.exit(0);
  }

  if (domain === "stormwater") {
    if (!(kindArg && isStormwaterKind(kindArg))) {
      die(
        "Missing or invalid stormwater type. Expected one of: noi-guide, quickstart"
      );
    }

    if (actionArg !== "generate") {
      die("Missing or invalid stormwater action. Expected: generate");
    }

    await handleStormwaterGenerate(kindArg, rest);
    process.exit(0);
  }

  die(
    `Unknown namespace: ${domain}. Expected one of: safety, quoting, stormwater`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  die(message);
});

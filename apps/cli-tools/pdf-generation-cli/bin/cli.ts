#!/usr/bin/env bun

/**
 * Desert PDF Generation CLI
 *
 * Usage:
 *   bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sssp init <output.json>
 *   bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sssp generate --in <input.json> --out <output.pdf>
 *   bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sds init <output.json>
 *   bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sds generate --in <input.json> --out <output.pdf> [--include-sheets] [--download-sheets-from-url] [--fail-on-missing-sheets]
 *   bun apps/cli-tools/pdf-generation-cli/bin/cli.ts quoting estimate generate --id <estimate-id> [--output <output.pdf>] [--include-back-page]
 */

import { parseArgs } from "node:util";
import type { SsspSection } from "@lib/pdf/sssp/types";
import { z } from "zod";
import { die, ensureDir, resolvePath } from "../src/common";
import {
  type GenerateEstimatePdfResult,
  generateEstimatePdfById,
} from "../src/quoting/generate";
import {
  generatePdf as generateSdsPdf,
  type GeneratePdfResult as SdsGenerateResult,
} from "../src/safety/sds/generate";
import { templateDoc as sdsTemplateDoc } from "../src/safety/sds/template";
import {
  generatePdf as generateSsspPdf,
  type SsspGenerateOverrides,
} from "../src/safety/sssp/generate";
import { templateDoc as ssspTemplateDoc } from "../src/safety/sssp/template";

type SafetyDocKind = "sds" | "sssp";
type SafetyAction = "init" | "generate";
type QuotingKind = "estimate";
type QuotingAction = "generate" | "pdf";

const SSSP_SECTION_NAMES = [
  "water-truck",
  "street-sweeping",
  "portable-sanitation",
] satisfies SsspSection[];

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

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function help(): void {
  // eslint-disable-next-line no-console
  console.log(`
Desert PDF Generation CLI

Usage:
  bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sssp init <output.json>
  bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sssp generate --in <input.json> --out <output.pdf> [--sections <all|comma-list>]

  bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sds init <output.json>
  bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sds generate --in <input.json> --out <output.pdf> [--include-sheets] [--download-sheets-from-url] [--fail-on-missing-sheets]

  bun apps/cli-tools/pdf-generation-cli/bin/cli.ts quoting estimate generate --id <estimate-id> [--output <output.pdf>] [--include-back-page]
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
  // eslint-disable-next-line no-console
  console.log(`Wrote template JSON: ${outPath}`);
}

const ssspGenerateSchema = z
  .object({
    in: z.string().trim().min(1),
    out: z.string().trim().min(1),
    sections: z.string().trim().optional(),
  })
  .strict();

function parseSsspSectionsOverride(raw: string): SsspSection[] {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    die(
      `Invalid --sections value. Allowed values: ${SSSP_SECTION_NAMES.join(", ")}, all`
    );
  }

  if (normalized === "all") {
    return [...SSSP_SECTION_NAMES];
  }

  if (normalized === "none" || normalized === "auto") {
    die(
      "Invalid --sections value " +
        normalized +
        ". This CLI requires at least one service section. Use all or a comma list of: " +
        SSSP_SECTION_NAMES.join(", ")
    );
  }

  const tokens = normalized
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length < 1) {
    die(
      `Invalid --sections value. Allowed values: ${SSSP_SECTION_NAMES.join(", ")}, all`
    );
  }

  const valid = new Set<SsspSection>(SSSP_SECTION_NAMES);
  const selected: SsspSection[] = [];

  for (const token of tokens) {
    if (!valid.has(token as SsspSection)) {
      die(
        `Invalid section ${token}. Allowed values: ${SSSP_SECTION_NAMES.join(", ")}, all`
      );
    }

    const section = token as SsspSection;
    if (!selected.includes(section)) {
      selected.push(section);
    }
  }

  if (selected.length < 1) {
    die(
      `SSSP requires at least one section. Choose one or more of: ${SSSP_SECTION_NAMES.join(", ")}`
    );
  }

  return selected;
}

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
  // eslint-disable-next-line no-console
  console.log(`Wrote PDF: ${outPath}`);
}

async function handleSafetySdsGenerate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      in: { type: "string" },
      out: { type: "string" },
      "include-sheets": { type: "boolean", default: false },
      "download-sheets-from-url": { type: "boolean", default: false },
      "fail-on-missing-sheets": { type: "boolean", default: false },
    },
  });

  const inPath = values.in ? resolvePath(values.in) : null;
  const outPath = values.out ? resolvePath(values.out) : null;
  if (!(inPath && outPath)) {
    die("generate requires --in <input.json> --out <output.pdf>");
  }

  ensureDir(outPath);
  const result: SdsGenerateResult = await generateSdsPdf(inPath, outPath, {
    includeSheets: values["include-sheets"],
    downloadSheetsFromUrl: values["download-sheets-from-url"],
    failOnMissingSheets: values["fail-on-missing-sheets"],
  });

  // eslint-disable-next-line no-console
  console.log(`Wrote PDF: ${outPath}`);
  if (values["include-sheets"]) {
    // eslint-disable-next-line no-console
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
    id: z.string().trim().min(1),
    output: z.string().trim().min(1).optional(),
    backpage: z.boolean().optional(),
    "include-back-page": z.boolean().optional(),
  })
  .strict();

async function handleQuotingEstimateGenerate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      id: { type: "string" },
      output: { type: "string" },
      backpage: { type: "boolean", default: false },
      "include-back-page": { type: "boolean", default: false },
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

  // eslint-disable-next-line no-console
  console.log(`Wrote PDF: ${result.outputPath}`);
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

  die(`Unknown namespace: ${domain}. Expected one of: safety, quoting`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  die(message);
});

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listEstimates } from "@/packages/estimates/estimating/estimate-read-service";

const BUN_BIN = Bun.which("bun") ?? `${process.env.HOME}/.bun/bin/bun`;
const CLI_PATH = "packages/documents/pdf-generation/cli/cli.ts";

interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

async function runCli(args: string[]): Promise<CliResult> {
  const proc = Bun.spawn([BUN_BIN, CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { code, stdout, stderr };
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  const header = Buffer.from(bytes.subarray(0, 4)).toString();
  return header === "%PDF";
}

describe("PDF Generation CLI", () => {
  test("shows help output", async () => {
    const result = await runCli(["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Desert PDF Generation CLI");
    expect(result.stdout).toContain("quoting estimate generate");
    expect(result.stdout).toContain("--sections <all|comma-list>");
  });

  test("safety sssp init writes enforceable template", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdfgen-sssp-init-"));
    const inPath = join(dir, "sssp-input.json");

    try {
      const init = await runCli(["safety", "sssp", "init", inPath]);
      expect(init.code).toBe(0);

      const template = await Bun.file(inPath).json();
      expect(template).toMatchObject({
        title: "Site Specific Safety Plan",
        revision: "0",
        projectName: "____________________________",
        projectAddress: "____________________________",
      });
      expect(Array.isArray(template.sections)).toBe(true);
      expect(template.sections).toEqual([]);
      expect(Array.isArray(template.contacts)).toBe(true);
      expect(template.contacts.length).toBeGreaterThanOrEqual(5);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("safety sssp generate fails when no section is selected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdfgen-sssp-no-sections-"));
    const inPath = join(dir, "sssp-input.json");
    const outPath = join(dir, "sssp.pdf");

    try {
      const init = await runCli(["safety", "sssp", "init", inPath]);
      expect(init.code).toBe(0);

      const generate = await runCli([
        "safety",
        "sssp",
        "generate",
        "--in",
        inPath,
        "--out",
        outPath,
      ]);

      expect(generate.code).toBe(1);
      expect(generate.stderr).toContain(
        "must include at least one service section"
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("safety sssp generate accepts explicit --sections list", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdfgen-sssp-sections-"));
    const inPath = join(dir, "sssp-input.json");
    const outPath = join(dir, "sssp.pdf");

    try {
      const init = await runCli(["safety", "sssp", "init", inPath]);
      expect(init.code).toBe(0);

      const generate = await runCli([
        "safety",
        "sssp",
        "generate",
        "--in",
        inPath,
        "--out",
        outPath,
        "--sections",
        "water-truck,portable-sanitation",
      ]);
      expect(generate.code).toBe(0);

      const bytes = new Uint8Array(await Bun.file(outPath).arrayBuffer());
      expect(bytes.length).toBeGreaterThan(0);
      expect(hasPdfHeader(bytes)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("safety sssp generate rejects invalid --sections values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdfgen-sssp-sections-invalid-"));
    const inPath = join(dir, "sssp-input.json");
    const outPath = join(dir, "sssp.pdf");

    try {
      const init = await runCli(["safety", "sssp", "init", inPath]);
      expect(init.code).toBe(0);

      const generate = await runCli([
        "safety",
        "sssp",
        "generate",
        "--in",
        inPath,
        "--out",
        outPath,
        "--sections",
        "street-sweeping,not-a-real-section",
      ]);
      expect(generate.code).toBe(1);
      expect(generate.stderr).toContain("Invalid section not-a-real-section");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("safety sssp generate enforces contact count and required contact fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdfgen-sssp-contacts-"));
    const inPath = join(dir, "sssp-input.json");
    const outPath = join(dir, "sssp.pdf");

    try {
      const init = await runCli(["safety", "sssp", "init", inPath]);
      expect(init.code).toBe(0);

      const template = await Bun.file(inPath).json();
      template.sections = ["water-truck"];
      template.contacts = template.contacts.slice(0, 4);
      await Bun.write(inPath, `${JSON.stringify(template, null, 2)}\n`);

      const generate = await runCli([
        "safety",
        "sssp",
        "generate",
        "--in",
        inPath,
        "--out",
        outPath,
      ]);

      expect(generate.code).toBe(1);
      expect(generate.stderr).toContain("contacts: Too small");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("safety sds init + generate", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdfgen-sds-"));
    const inPath = join(dir, "sds-input.json");
    const outPath = join(dir, "sds.pdf");

    try {
      const init = await runCli(["safety", "sds", "init", inPath]);
      expect(init.code).toBe(0);

      const generate = await runCli([
        "safety",
        "sds",
        "generate",
        "--in",
        inPath,
        "--out",
        outPath,
      ]);
      expect(generate.code).toBe(0);

      const bytes = new Uint8Array(await Bun.file(outPath).arrayBuffer());
      expect(bytes.length).toBeGreaterThan(0);
      expect(hasPdfHeader(bytes)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("quoting estimate generate validates required --id", async () => {
    const result = await runCli(["quoting", "estimate", "generate"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Invalid quoting estimate generate args");
  });
});

let estimateIdForPdfGen: string | null = null;
let estimateIdLookupError: string | null = null;
const runLiveTests = process.env.RUN_LIVE_TESTS === "1";

try {
  const estimates = await listEstimates();
  estimateIdForPdfGen = estimates[0]?.id ?? null;
} catch (error) {
  estimateIdLookupError =
    error instanceof Error ? error.message : String(error);
}

if (runLiveTests && estimateIdForPdfGen) {
  test("quoting estimate generate writes a valid PDF", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdfgen-quote-"));
    const outPath = join(dir, "estimate.pdf");

    try {
      const result = await runCli([
        "quoting",
        "estimate",
        "generate",
        "--id",
        estimateIdForPdfGen,
        "--output",
        outPath,
      ]);

      expect(result.code).toBe(0);
      const bytes = new Uint8Array(await Bun.file(outPath).arrayBuffer());
      expect(bytes.length).toBeGreaterThan(0);
      expect(hasPdfHeader(bytes)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
} else {
  const reason = runLiveTests
    ? `no estimate available${estimateIdLookupError ? `: ${estimateIdLookupError}` : ""}`
    : "set RUN_LIVE_TESTS=1";
  // biome-ignore lint/suspicious/noSkippedTests: Integration data is environment-dependent.
  test.skip(`quoting estimate generate integration (${reason})`, () => {
    // Intentionally skipped when integration data is unavailable.
  });
}

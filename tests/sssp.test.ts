import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSsspPDF } from "@lib/pdf/sssp/generate-sssp-pdf.server";
import type { SsspDocument } from "@lib/pdf/sssp/types";

const PDFTOTEXT_BIN = Bun.which?.("pdftotext") ?? null;
const INPUT_PATH = "data/triage/1400-w-3rd/sssp-input.json";

async function pdftotext(bytes: Uint8Array): Promise<string> {
  if (!PDFTOTEXT_BIN) {
    throw new Error("pdftotext not found");
  }

  const dir = await mkdtemp(join(tmpdir(), "sssp-test-"));
  const pdfPath = join(dir, "out.pdf");
  const txtPath = join(dir, "out.txt");
  try {
    await Bun.write(pdfPath, bytes);
    // Use system pdftotext for deterministic assertions.
    const proc = Bun.spawn([PDFTOTEXT_BIN, "-layout", pdfPath, txtPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    if (code !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`pdftotext failed (${code}): ${err}`);
    }
    return await Bun.file(txtPath).text();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (!PDFTOTEXT_BIN) {
  test.skip("SSSP generation (requires pdftotext in PATH)", () => {});
} else if (!existsSync(INPUT_PATH)) {
  test.skip(`SSSP generation (missing ${INPUT_PATH})`, () => {});
} else {
  test("SSSP generation stays in-scope and avoids typed bullets/wrapped emails", async () => {
    const doc = (await Bun.file(INPUT_PATH).json()) as SsspDocument;

    const bytes = await generateSsspPDF(doc);
    const text = await pdftotext(bytes);

    // Must include cover labels.
    expect(text).toContain("Project:");
    expect(text).toContain("Contractor:");
    expect(text).toContain("Address:");
    expect(text).toContain("Job Number:");

    // No out-of-scope sections for SWPPP-only jobs.
    expect(text).not.toContain("Water Truck Operations");
    expect(text).not.toContain("Street Sweeping");
    expect(text).not.toContain("portable toilets");
    expect(text).not.toContain("roll-off");

    // Enforce parity: no literal typed bullet character should appear in extracted text.
    // (All lists should be native pdfmake ul/ol.)
    expect(text).not.toContain("•");

    // Don't hard-wrap emails in code (e.g. inserting '@\\n').
    expect(text).not.toContain("@\n");
  });
}

/**
 * Tests for Mistral OCR extraction
 */
import { describe, expect, it } from "bun:test";

const MISTRAL_API_KEY =
  process.env.MISTRAL_API_KEY ?? "7vkLXmFnfHBMXfcOjIrbwJitpCHXjkan";

interface MistralOcrPage {
  index: number;
  markdown: string;
  images: Array<{
    id: string;
    top_left_x: number;
    top_left_y: number;
    bottom_right_x: number;
    bottom_right_y: number;
  }>;
  tables: unknown[];
  hyperlinks: unknown[];
  header: string | null;
  footer: string | null;
  dimensions: { dpi: number; width: number; height: number };
}

interface MistralOcrResponse {
  pages: MistralOcrPage[];
  model: string;
  document_annotation: unknown;
  usage_info: { pages_processed: number; doc_size_bytes: number };
}

async function extractPdfText(pdfBytes: Buffer): Promise<MistralOcrResponse> {
  const base64 = pdfBytes.toString("base64");

  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: `data:application/pdf;base64,${base64}`,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mistral OCR failed: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<MistralOcrResponse>;
}

describe("Mistral OCR", () => {
  it("extracts text from PDF", async () => {
    const file = Bun.file(
      "docs/Est_09152505_from_DESERT_SERVICES_LLC_19424.pdf"
    );
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await extractPdfText(buffer);

    // Check response structure
    expect(result.pages).toBeArray();
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.model).toContain("ocr");
    expect(result.usage_info.pages_processed).toBeGreaterThan(0);

    // Check page structure
    const firstPage = result.pages[0];
    expect(firstPage.index).toBe(0);
    expect(firstPage.markdown).toBeString();
    expect(firstPage.markdown.length).toBeGreaterThan(100);
    expect(firstPage.dimensions).toHaveProperty("width");
    expect(firstPage.dimensions).toHaveProperty("height");

    // Check content extraction
    const fullText = result.pages.map((p) => p.markdown).join("\n\n");
    expect(fullText).toContain("DESERT SERVICES");
    expect(fullText).toContain("Estimate");
  });

  it("returns markdown with table formatting", async () => {
    const file = Bun.file(
      "docs/Est_09152505_from_DESERT_SERVICES_LLC_19424.pdf"
    );
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await extractPdfText(buffer);
    const fullText = result.pages.map((p) => p.markdown).join("\n\n");

    // Mistral OCR formats tables as markdown
    expect(fullText).toContain("|");
    expect(fullText).toContain("---");
  });
});

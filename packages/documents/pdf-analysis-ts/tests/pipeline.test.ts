import { describe, expect, test } from "bun:test";
import { parseWithFallback } from "@pdf-analysis/services/pipeline";
import type {
  OcrProvider,
  OcrResult,
  TextExtractionResult,
} from "@pdf-analysis/types";

class MockProvider implements OcrProvider {
  readonly name = "mock-ocr";
  private readonly available: boolean;
  private readonly payload: OcrResult;

  constructor(available: boolean, payload: OcrResult) {
    this.available = available;
    this.payload = payload;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.available);
  }

  ocrPdf(_filePath: string): Promise<OcrResult> {
    return Promise.resolve(this.payload);
  }
}

describe("parseWithFallback", () => {
  test("uses text layer when it passes threshold", async () => {
    const provider = new MockProvider(true, {
      provider: "mock-ocr",
      model: "rapidocronnx",
      content: "ocr",
      pageCount: 2,
    });

    const textExtractor = async (): Promise<TextExtractionResult> => ({
      content: "x".repeat(1000),
      extractor: "kreuzberg",
      hasText: true,
      pageCount: 2,
      pagesWithText: 2,
    });

    const result = await parseWithFallback(
      "/tmp/example.pdf",
      provider,
      { minTextLength: 400 },
      textExtractor
    );
    expect(result.method).toBe("text-layer");
    expect(result.content.length).toBe(1000);
    expect(result.steps[0]).toContain("1.");
  });

  test("falls back to ocr when text is sparse", async () => {
    const provider = new MockProvider(true, {
      provider: "mock-ocr",
      model: "rapidocronnx",
      content: "x".repeat(900),
      pageCount: 3,
    });

    const textExtractor = async (): Promise<TextExtractionResult> => ({
      content: "short",
      extractor: "kreuzberg",
      hasText: true,
      pageCount: 3,
      pagesWithText: 1,
    });

    const result = await parseWithFallback(
      "/tmp/example.pdf",
      provider,
      { minTextLength: 400 },
      textExtractor
    );
    expect(result.method).toBe("ocr-fallback");
    expect(result.content.length).toBe(900);
    expect(result.steps.join("\n")).toContain("OCR fallback");
  });
});

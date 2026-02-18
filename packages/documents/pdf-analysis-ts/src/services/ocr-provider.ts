import { extractPdfWithForcedOcr } from "@pdf-analysis/services/kreuzberg";
import type { OcrProvider, OcrResult } from "@pdf-analysis/types";

export class KreuzbergOcrProvider implements OcrProvider {
  readonly name: string;
  readonly backend: string;
  readonly language?: string;

  constructor(options?: { backend?: string; language?: string }) {
    this.backend =
      options?.backend?.trim() ||
      process.env.KREUZBERG_OCR_BACKEND ||
      "rapidocronnx";
    this.language =
      options?.language?.trim() || process.env.KREUZBERG_OCR_LANGUAGE;
    this.name = `kreuzberg:${this.backend}`;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.backend.length > 0);
  }

  async ocrPdf(filePath: string): Promise<OcrResult> {
    const extracted = await extractPdfWithForcedOcr(
      filePath,
      this.backend,
      this.language
    );
    return {
      provider: this.name,
      model: this.backend,
      content: extracted.content,
      pageCount: extracted.pageCount,
    };
  }
}

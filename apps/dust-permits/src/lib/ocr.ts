/**
 * OCR utilities using vLLM with LightOnOCR model
 *
 * Usage:
 *   import { extractText, extractTextFromPdf } from "@/lib/ocr";
 *
 *   // From image file
 *   const text = await extractText("/path/to/image.png");
 *
 *   // From PDF (extracts specific pages)
 *   const results = await extractTextFromPdf("/path/to/doc.pdf", { pages: [1, 2, 3] });
 */

import { PDFDocument } from "pdf-lib";

// Configuration
const VLLM_ENDPOINT =
  process.env.VLLM_OCR_ENDPOINT ??
  "http://vllm.peacockery.studio/v1/chat/completions";
const VLLM_MODEL = process.env.VLLM_OCR_MODEL ?? "lightonai/LightOnOCR-1B-1025";
const MAX_TOKENS = 4096;

const MIME_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
};

function getMimeType(ext: string | undefined): string {
  return MIME_TYPES[ext ?? ""] ?? "image/png";
}

// Types
export interface OCRResult {
  success: boolean;
  text: string | null;
  error?: string;
  metadata?: {
    imageSize: number;
    processingTimeMs: number;
  };
}

export interface PDFOCRResult {
  success: boolean;
  pages: {
    page: number;
    text: string | null;
    error?: string;
  }[];
  totalPages: number;
}

export interface OCROptions {
  prompt?: string;
  maxTokens?: number;
}

export interface PDFOCROptions extends OCROptions {
  pages?: number[];
  resolution?: number;
}

/**
 * Extract text from an image file using LightOnOCR
 */
export async function extractText(
  imagePath: string,
  options: OCROptions = {}
): Promise<OCRResult> {
  const startTime = Date.now();
  const prompt = options.prompt ?? "Extract all text from this image.";
  const maxTokens = options.maxTokens ?? MAX_TOKENS;

  try {
    const file = Bun.file(imagePath);
    const exists = await file.exists();

    if (!exists) {
      return { error: "File not found", success: false, text: null };
    }

    const imageBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");

    // Determine mime type from extension
    const ext = imagePath.split(".").pop()?.toLowerCase();
    const mimeType = getMimeType(ext);

    const response = await fetch(VLLM_ENDPOINT, {
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
        max_tokens: maxTokens,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        error: `API error ${response.status}: ${error}`,
        success: false,
        text: null,
      };
    }

    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = result.choices?.[0]?.message?.content ?? null;

    return {
      metadata: {
        imageSize: imageBuffer.byteLength,
        processingTimeMs: Date.now() - startTime,
      },
      success: true,
      text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message, success: false, text: null };
  }
}

/**
 * Extract text from an image buffer
 */
export async function extractTextFromBuffer(
  buffer: ArrayBuffer,
  mimeType: string,
  options: OCROptions = {}
): Promise<OCRResult> {
  const startTime = Date.now();
  const prompt = options.prompt ?? "Extract all text from this image.";
  const maxTokens = options.maxTokens ?? MAX_TOKENS;

  try {
    const base64 = Buffer.from(buffer).toString("base64");

    const response = await fetch(VLLM_ENDPOINT, {
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
        max_tokens: maxTokens,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        error: `API error ${response.status}: ${error}`,
        success: false,
        text: null,
      };
    }

    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = result.choices?.[0]?.message?.content ?? null;

    return {
      metadata: {
        imageSize: buffer.byteLength,
        processingTimeMs: Date.now() - startTime,
      },
      success: true,
      text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message, success: false, text: null };
  }
}

/**
 * Convert a PDF page to PNG using pdftoppm
 */
async function pdfPageToImage(
  pdfPath: string,
  pageNum: number,
  resolution = 150
): Promise<{ buffer: ArrayBuffer; cleanup: () => Promise<void> }> {
  const outputPrefix = `/tmp/ocr-page-${Date.now()}-${pageNum}`;

  const proc = Bun.spawn(
    [
      "pdftoppm",
      "-png",
      "-f",
      String(pageNum),
      "-l",
      String(pageNum),
      "-r",
      String(resolution),
      pdfPath,
      outputPrefix,
    ],
    {
      stderr: "pipe",
      stdout: "pipe",
    }
  );

  await proc.exited;

  // pdftoppm uses zero-padded page numbers (e.g., -01.png, -001.png)
  // Try common patterns
  const patterns = [
    `${outputPrefix}-${pageNum}.png`,
    `${outputPrefix}-${String(pageNum).padStart(2, "0")}.png`,
    `${outputPrefix}-${String(pageNum).padStart(3, "0")}.png`,
  ];

  let outputPath: string | null = null;
  for (const pattern of patterns) {
    if (await Bun.file(pattern).exists()) {
      outputPath = pattern;
      break;
    }
  }

  if (!outputPath) {
    throw new Error(`Failed to convert PDF page ${pageNum} to image`);
  }

  const file = Bun.file(outputPath);

  const buffer = await file.arrayBuffer();

  return {
    buffer,
    cleanup: async () => {
      await Bun.$`rm -f ${outputPath}`.quiet();
    },
  };
}

/**
 * Get total page count from a PDF
 */
async function getPdfPageCount(pdfPath: string): Promise<number> {
  const pdfBuffer = await Bun.file(pdfPath).arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return pdfDoc.getPageCount();
}

/**
 * Extract text from specific pages of a PDF
 */
export async function extractTextFromPdf(
  pdfPath: string,
  options: PDFOCROptions = {}
): Promise<PDFOCRResult> {
  const resolution = options.resolution ?? 150;
  const prompt = options.prompt ?? "Extract all text from this document page.";

  try {
    const file = Bun.file(pdfPath);
    if (!(await file.exists())) {
      return { pages: [], success: false, totalPages: 0 };
    }

    const totalPages = await getPdfPageCount(pdfPath);
    const pagesToProcess = options.pages ?? [1]; // Default to first page

    const results: PDFOCRResult["pages"] = [];

    for (const pageNum of pagesToProcess) {
      if (pageNum < 1 || pageNum > totalPages) {
        results.push({
          error: `Page ${pageNum} out of range (1-${totalPages})`,
          page: pageNum,
          text: null,
        });
        continue;
      }

      try {
        const { buffer, cleanup } = await pdfPageToImage(
          pdfPath,
          pageNum,
          resolution
        );

        const ocrResult = await extractTextFromBuffer(buffer, "image/png", {
          maxTokens: options.maxTokens,
          prompt,
        });

        await cleanup();

        results.push({
          error: ocrResult.error,
          page: pageNum,
          text: ocrResult.text,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ error: message, page: pageNum, text: null });
      }
    }

    return {
      pages: results,
      success: results.some((r) => r.text !== null),
      totalPages,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      pages: [{ page: 0, text: null, error: message }],
      success: false,
      totalPages: 0,
    };
  }
}

/**
 * Check if the OCR endpoint is available
 */
export async function checkOCRHealth(): Promise<boolean> {
  try {
    const modelsUrl = VLLM_ENDPOINT.replace(
      "/v1/chat/completions",
      "/v1/models"
    );
    const response = await fetch(modelsUrl);
    return response.ok;
  } catch {
    return false;
  }
}

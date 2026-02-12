import { mkdirSync } from "node:fs";
import { join } from "node:path";

const PDF_TEST_OUTPUT_DIR = join(
  process.cwd(),
  ".tmp",
  "test-artifacts",
  "pdf"
);

export function getPdfTestOutputPath(filename: string): string {
  mkdirSync(PDF_TEST_OUTPUT_DIR, { recursive: true });
  return join(PDF_TEST_OUTPUT_DIR, filename);
}

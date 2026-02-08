// Shared logo loader for PDF generation
// Canonical location: lib/assets/logo.png

import { join } from "node:path";

const LOGO_PATH = join(import.meta.dir, "..", "..", "assets", "logo.png");

/**
 * Load the Desert Services logo as a base64 data URI.
 * Returns a string like "data:image/png;base64,..."
 */
export async function loadLogo(): Promise<string> {
  const bytes = await Bun.file(LOGO_PATH).bytes();
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:image/png;base64,${base64}`;
}

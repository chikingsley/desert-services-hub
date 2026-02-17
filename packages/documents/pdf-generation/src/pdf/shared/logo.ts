// Shared logo loader for PDF generation
// Canonical location: apps/web/frontend/public/logo.png

import { join } from "node:path";

const LOGO_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
  "apps",
  "web",
  "frontend",
  "public",
  "logo.png"
);

async function resolveLogoPath(): Promise<string> {
  const logoFile = Bun.file(LOGO_PATH);
  if (await logoFile.exists()) {
    return LOGO_PATH;
  }

  throw new Error(`Unable to locate logo asset at: ${LOGO_PATH}`);
}

/**
 * Load the Desert Services logo as a base64 data URI.
 * Returns a string like "data:image/png;base64,..."
 */
export async function loadLogo(): Promise<string> {
  const logoPath = await resolveLogoPath();
  const bytes = await Bun.file(logoPath).bytes();
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:image/png;base64,${base64}`;
}

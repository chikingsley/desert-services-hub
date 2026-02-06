/**
 * DocuSign automation configuration
 */
import { z } from "zod";

const envSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required for Stagehand"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Missing environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  geminiApiKey: parsed.data.GOOGLE_API_KEY,
  headless: process.env.HEADLESS !== "false",
  downloadDir:
    process.env.DOCUSIGN_DOWNLOAD_DIR ||
    `${import.meta.dir}/../../data/docusign-downloads`,
  browserProfileDir: `${import.meta.dir}/../../data/browser-profile-docusign`,
};

/**
 * Enrichment Service Types (non-PDL)
 *
 * PDL types are now in ./pdl/types.ts
 */

// Avatar types
export interface AvatarResult {
  source: "gravatar" | "initials" | "clearbit";
  url: string;
}

// Company logo types
export interface LogoResult {
  exists: boolean;
  url: string;
}

// ── Job Payload Schemas ─────────────────────────────────────

import { z } from "zod";

export const CONTACT_ENRICHMENT_PAYLOAD_SCHEMA = z.object({
  batchSize: z.number().int().positive(),
});
export type ContactEnrichmentPayload = z.infer<
  typeof CONTACT_ENRICHMENT_PAYLOAD_SCHEMA
>;

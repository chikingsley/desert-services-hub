import { z } from "zod";
import type { MegaSearchRow } from "./megasearch-types";

const megaSearchEnvelopeSchema = z
  .object({
    sEcho: z.number().optional(),
    iTotalRecords: z.number().optional(),
    iTotalDisplayRecords: z.number().optional(),
    aaData: z.unknown().optional(),
  })
  .catchall(z.unknown());

const megaSearchRowSchema = z.record(z.string(), z.unknown());

export function parseMegaSearchEnvelope(
  payload: unknown,
  endpoint: string
): {
  envelope: Record<string, unknown>;
  rows: MegaSearchRow[];
} {
  const envelope = megaSearchEnvelopeSchema.parse(payload) as Record<
    string,
    unknown
  >;

  const endpointData = envelope[endpoint];
  if (!Array.isArray(endpointData)) {
    throw new Error(
      `MegaSearch payload for "${endpoint}" did not contain an array field for that endpoint.`
    );
  }

  const rows: MegaSearchRow[] = [];
  for (const item of endpointData) {
    rows.push(megaSearchRowSchema.parse(item));
  }

  return {
    envelope,
    rows,
  };
}

import { z } from "zod";

export const LINK_ESTIMATE_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
});
export type LinkEstimatePayload = z.infer<typeof LINK_ESTIMATE_PAYLOAD_SCHEMA>;

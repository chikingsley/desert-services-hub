import { z } from "zod";

export const SYNC_BC_FILE_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
});
export type SyncBcFilePayload = z.infer<typeof SYNC_BC_FILE_PAYLOAD_SCHEMA>;

import { z } from "zod";

export const announcementDismissedBody = z.object({
  publishedAt: z.iso.datetime(),
});
export type AnnouncementDismissedBody = z.infer<
  typeof announcementDismissedBody
>;

import { z } from "zod";
import { NewsletterStatus } from "@/generated/prisma/enums";

export const setNewsletterStatusBody = z.object({
  newsletterEmail: z.email(),
  status: z.enum(NewsletterStatus).nullable(),
});
export type SetNewsletterStatusBody = z.infer<typeof setNewsletterStatusBody>;

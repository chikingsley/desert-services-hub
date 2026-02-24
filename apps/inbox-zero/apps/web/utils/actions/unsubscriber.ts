"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { setNewsletterStatusBody } from "@/utils/actions/unsubscriber.validation";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";

export const setNewsletterStatusAction = actionClient
  .metadata({ name: "setNewsletterStatus" })
  .inputSchema(setNewsletterStatusBody)
  .action(
    async ({
      parsedInput: { newsletterEmail, status },
      ctx: { emailAccountId },
    }) => {
      const email = extractEmailAddress(newsletterEmail);

      return await prisma.newsletter.upsert({
        where: {
          email_emailAccountId: { email, emailAccountId },
        },
        create: {
          status,
          email,
          emailAccountId,
        },
        update: { status },
      });
    }
  );

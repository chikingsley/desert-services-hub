"use server";

import { env } from "@/env";
import { actionClient } from "@/utils/actions/safe-action";
import { createEmailProvider } from "@/utils/email/provider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { GmailLabel } from "@/utils/gmail/label";

export const whitelistInboxZeroAction = actionClient
  .metadata({ name: "whitelistInboxZero" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    if (!env.WHITELIST_FROM) {
      return;
    }
    if (!isGoogleProvider(provider)) {
      return;
    }

    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });

    await emailProvider.createFilter({
      from: env.WHITELIST_FROM,
      addLabelIds: ["CATEGORY_PERSONAL", GmailLabel.IMPORTANT],
      removeLabelIds: [GmailLabel.SPAM],
    });
  });

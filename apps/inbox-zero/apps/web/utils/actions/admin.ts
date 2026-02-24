"use server";

import { z } from "zod";
import {
  cleanupDraftsBody,
  convertGmailUrlBody,
  disableAllRulesBody,
  getLabelsBody,
  getUserInfoBody,
  hashEmailBody,
  watchEmailsBody,
} from "@/utils/actions/admin.validation";
import { adminActionClient } from "@/utils/actions/safe-action";
import { cleanupAIDraftsForAccount } from "@/utils/ai/draft-cleanup";
import { createEmailProvider } from "@/utils/email/provider";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import { SafeError } from "@/utils/error";
import { hash } from "@/utils/hash";
import prisma from "@/utils/prisma";
import { deleteUser } from "@/utils/user/delete";

export const adminProcessHistoryAction = adminActionClient
  .metadata({ name: "adminProcessHistory" })
  .inputSchema(
    z.object({
      emailAddress: z.string(),
      historyId: z.number().optional(),
      startHistoryId: z.number().optional(),
    })
  )
  .action(
    async ({
      parsedInput: { emailAddress, historyId, startHistoryId },
      ctx: { logger },
    }) => {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email: emailAddress.toLowerCase() },
        select: {
          id: true,
          account: {
            select: {
              provider: true,
            },
          },
          watchEmailsSubscriptionId: true,
        },
      });

      if (!emailAccount) {
        throw new SafeError("Email account not found");
      }

      const provider = emailAccount.account?.provider;

      if (!provider) {
        throw new SafeError("No provider found for email account");
      }

      const emailProvider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider,
        logger,
      });

      await emailProvider.processHistory({
        emailAddress,
        historyId,
        startHistoryId,
        subscriptionId: emailAccount.watchEmailsSubscriptionId || undefined,
        resourceData: {
          id: historyId?.toString() || "0",
          conversationId: startHistoryId?.toString(),
        },
      });
    }
  );

export const adminDeleteAccountAction = adminActionClient
  .metadata({ name: "adminDeleteAccount" })
  .inputSchema(z.object({ email: z.string() }))
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    try {
      const userToDelete = await prisma.user.findUnique({ where: { email } });
      if (!userToDelete) {
        throw new SafeError("User not found");
      }

      await deleteUser({ userId: userToDelete.id, logger });
    } catch (error) {
      logger.error("Failed to delete user", { email, error });
      throw new SafeError(
        `Failed to delete user: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return { success: "User deleted" };
  });

export const adminSyncStripeForAllUsersAction = adminActionClient
  .metadata({ name: "syncStripeForAllUsers" })
  .action(async () => {
    return { success: "Billing sync is disabled in this internal fork." };
  });

export const adminSyncAllStripeCustomersToDbAction = adminActionClient
  .metadata({ name: "adminSyncAllStripeCustomersToDb" })
  .action(async () => {
    return { success: "Billing sync is disabled in this internal fork." };
  });

export const adminHashEmailAction = adminActionClient
  .metadata({ name: "adminHashEmail" })
  .inputSchema(hashEmailBody)
  .action(async ({ parsedInput: { email } }) => {
    const hashed = hash(email);
    return { hash: hashed };
  });

export const adminConvertGmailUrlAction = adminActionClient
  .metadata({ name: "adminConvertGmailUrl" })
  .inputSchema(convertGmailUrlBody)
  .action(
    async ({ parsedInput: { rfc822MessageId, email }, ctx: { logger } }) => {
      // Clean up Message-ID (remove < > if present)
      const cleanMessageId = rfc822MessageId.trim().replace(/^<|>$/g, "");

      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          account: {
            select: {
              provider: true,
            },
          },
        },
      });

      if (!emailAccount) {
        throw new SafeError("Email account not found");
      }

      const emailProvider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: emailAccount.account.provider,
        logger,
      });

      const message =
        await emailProvider.getMessageByRfc822MessageId(cleanMessageId);

      if (!message) {
        throw new SafeError(
          `Could not find message with RFC822 Message-ID: ${cleanMessageId}`
        );
      }

      if (!message.threadId) {
        throw new SafeError("Message does not have a thread ID");
      }

      const thread = await emailProvider.getThread(message.threadId);

      if (!thread) {
        throw new SafeError("Could not find thread for message");
      }

      const messages =
        thread.messages?.map((m) => ({
          id: m.id,
          date: m.internalDate || null,
        })) || [];

      return {
        threadId: thread.id,
        messages,
        rfc822MessageId: cleanMessageId,
      };
    }
  );

export const adminGetLabelsAction = adminActionClient
  .metadata({ name: "adminGetLabels" })
  .inputSchema(getLabelsBody)
  .action(async ({ parsedInput: { emailAccountId }, ctx: { logger } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        id: true,
        account: {
          select: {
            provider: true,
          },
        },
      },
    });

    if (!emailAccount) {
      throw new SafeError("Email account not found");
    }

    const emailProvider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: emailAccount.account.provider,
      logger,
    });

    const labels = await emailProvider.getLabels();

    return { labels };
  });

export const adminWatchEmailsAction = adminActionClient
  .metadata({ name: "adminWatchEmails" })
  .inputSchema(watchEmailsBody)
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { email: email.toLowerCase() },
      select: { userId: true },
    });

    if (!emailAccount) {
      throw new SafeError("Email account not found");
    }

    const results = await ensureEmailAccountsWatched({
      userIds: [emailAccount.userId],
      logger,
    });

    return { results };
  });

export const adminGetUserInfoAction = adminActionClient
  .metadata({ name: "adminGetUserInfo" })
  .inputSchema(getUserInfoBody)
  .action(async ({ parsedInput: { email } }) => {
    const lowerEmail = email.toLowerCase();

    // Try finding by User.email first, then fall back to EmailAccount.email
    let user = await findUserWithDetails(lowerEmail);

    if (!user) {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email: lowerEmail },
        select: { userId: true },
      });

      if (emailAccount) {
        user = await findUserWithDetails(undefined, emailAccount.userId);
      }
    }

    if (!user) {
      throw new SafeError("User not found");
    }

    // Get last executed rule date per email account
    const emailAccountIds = user.emailAccounts.map((ea) => ea.id);
    const lastExecutedRules =
      emailAccountIds.length > 0
        ? await prisma.executedRule.groupBy({
            by: ["emailAccountId"],
            where: { emailAccountId: { in: emailAccountIds } },
            _max: { createdAt: true },
          })
        : [];

    const lastExecutedMap = new Map(
      lastExecutedRules.map((r) => [r.emailAccountId, r._max.createdAt])
    );

    return {
      id: user.id,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      emailAccountCount: user._count.emailAccounts,
      premium: user.premium
        ? {
            tier: user.premium.tier,
            renewsAt:
              user.premium.stripeRenewsAt ||
              user.premium.lemonSqueezyRenewsAt ||
              null,
            subscriptionStatus:
              user.premium.stripeSubscriptionStatus ||
              user.premium.lemonSubscriptionStatus ||
              null,
          }
        : null,
      emailAccounts: user.emailAccounts.map((ea) => ({
        email: ea.email,
        createdAt: ea.createdAt,
        provider: ea.account.provider,
        disconnected: !!ea.account.disconnectedAt,
        watchExpirationDate: ea.watchEmailsExpirationDate,
        ruleCount: ea._count.rules,
        lastExecutedRuleAt: lastExecutedMap.get(ea.id) || null,
      })),
    };
  });

export const adminDisableAllRulesAction = adminActionClient
  .metadata({ name: "adminDisableAllRules" })
  .inputSchema(disableAllRulesBody)
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    const emailAccounts = await prisma.emailAccount.findMany({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { user: { email: email.toLowerCase() } },
        ],
      },
      select: { id: true },
    });

    if (emailAccounts.length === 0) {
      throw new SafeError("No email accounts found");
    }

    const emailAccountIds = emailAccounts.map((ea) => ea.id);

    await prisma.$transaction([
      prisma.rule.updateMany({
        where: { emailAccountId: { in: emailAccountIds } },
        data: { enabled: false },
      }),
      prisma.emailAccount.updateMany({
        where: { id: { in: emailAccountIds } },
        data: {
          followUpAwaitingReplyDays: null,
          followUpNeedsReplyDays: null,
        },
      }),
    ]);

    logger.info("Disabled all rules and follow-up for email accounts", {
      emailAccountCount: emailAccounts.length,
    });

    return {
      success: true,
      emailAccountCount: emailAccounts.length,
    };
  });

export const adminCleanupDraftsAction = adminActionClient
  .metadata({ name: "adminCleanupDrafts" })
  .inputSchema(cleanupDraftsBody)
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    const emailAccounts = await prisma.emailAccount.findMany({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { user: { email: email.toLowerCase() } },
        ],
      },
      select: {
        id: true,
        account: { select: { provider: true } },
      },
    });

    if (emailAccounts.length === 0) {
      throw new SafeError("No email accounts found");
    }

    let totalDeleted = 0;
    let totalSkipped = 0;
    let totalAlreadyGone = 0;
    let totalErrors = 0;

    for (const emailAccount of emailAccounts) {
      const result = await cleanupAIDraftsForAccount({
        emailAccountId: emailAccount.id,
        provider: emailAccount.account.provider,
        logger,
      });

      totalDeleted += result.deleted;
      totalSkipped += result.skippedModified;
      totalAlreadyGone += result.alreadyGone;
      totalErrors += result.errors;
    }

    return {
      deleted: totalDeleted,
      skippedModified: totalSkipped,
      alreadyGone: totalAlreadyGone,
      errors: totalErrors,
    };
  });

async function findUserWithDetails(email?: string, userId?: string) {
  return prisma.user.findUnique({
    where: email ? { email } : { id: userId },
    select: {
      id: true,
      createdAt: true,
      lastLogin: true,
      premium: {
        select: {
          tier: true,
          lemonSqueezyRenewsAt: true,
          stripeRenewsAt: true,
          stripeSubscriptionStatus: true,
          lemonSubscriptionStatus: true,
        },
      },
      emailAccounts: {
        select: {
          id: true,
          email: true,
          createdAt: true,
          watchEmailsExpirationDate: true,
          account: {
            select: {
              provider: true,
              disconnectedAt: true,
            },
          },
          _count: {
            select: {
              rules: true,
            },
          },
        },
      },
      _count: {
        select: {
          emailAccounts: true,
        },
      },
    },
  });
}

"use server";

import uniq from "lodash/uniq";
import { z } from "zod";
import { changePremiumStatusSchema } from "@/app/(app)/admin/validation";
import { env } from "@/env";
import { PremiumTier } from "@/generated/prisma/enums";
import {
  actionClientUser,
  adminActionClient,
} from "@/utils/actions/safe-action";
import { ONE_MONTH_MS, ONE_YEAR_MS } from "@/utils/date";
import { SafeError } from "@/utils/error";
import { isAdminForPremium, isOnHigherTier, isPremium } from "@/utils/premium";
import { createPremiumForUser } from "@/utils/premium/create-premium";
import {
  cancelPremiumLemon,
  syncPremiumSeats,
  upgradeToPremiumLemon,
} from "@/utils/premium/server";
import prisma from "@/utils/prisma";

const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000;

export const decrementUnsubscribeCreditAction = actionClientUser
  .metadata({ name: "decrementUnsubscribeCredit" })
  .action(async ({ ctx: { userId } }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        premium: {
          select: {
            id: true,
            unsubscribeCredits: true,
            unsubscribeMonth: true,
            lemonSqueezyRenewsAt: true,
            stripeSubscriptionStatus: true,
          },
        },
      },
    });

    if (!user) {
      throw new SafeError("User not found");
    }

    const isUserPremium = isPremium(
      user.premium?.lemonSqueezyRenewsAt || null,
      user.premium?.stripeSubscriptionStatus || null
    );
    if (isUserPremium) {
      return;
    }

    const currentMonth = new Date().getMonth() + 1;

    // create premium row for user if it doesn't already exist
    const premium = user.premium || (await createPremiumForUser({ userId }));

    if (
      !premium?.unsubscribeMonth ||
      premium?.unsubscribeMonth !== currentMonth
    ) {
      // reset the monthly credits
      await prisma.premium.update({
        where: { id: premium.id },
        data: {
          // reset and use a credit
          unsubscribeCredits: env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS - 1,
          unsubscribeMonth: currentMonth,
        },
      });
    } else {
      if (!premium?.unsubscribeCredits || premium.unsubscribeCredits <= 0) {
        return;
      }

      // decrement the monthly credits
      await prisma.premium.update({
        where: { id: premium.id },
        data: { unsubscribeCredits: { decrement: 1 } },
      });
    }
  });

export const updateMultiAccountPremiumAction = actionClientUser
  .metadata({ name: "updateMultiAccountPremium" })
  .inputSchema(z.object({ emails: z.array(z.string()) }))
  .action(async ({ ctx: { userId }, parsedInput: { emails } }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        premium: {
          select: {
            id: true,
            tier: true,
            emailAccountsAccess: true,
            admins: { select: { id: true } },
            pendingInvites: true,
            users: { select: { id: true, email: true } },
          },
        },
        emailAccounts: { select: { email: true } },
      },
    });

    if (!user) {
      throw new SafeError("User not found");
    }

    if (!isAdminForPremium(user.premium?.admins || [], userId)) {
      throw new SafeError("Not admin");
    }

    // check all users exist
    const uniqueEmails = uniq(emails);
    const users = await prisma.user.findMany({
      where: { email: { in: uniqueEmails } },
      select: { id: true, premium: true, email: true },
    });

    const premium = user.premium || (await createPremiumForUser({ userId }));

    const otherUsers = users.filter((u) => u.id !== userId);

    // make sure that the users being added to this plan are not on higher tiers already
    for (const userToAdd of otherUsers) {
      if (isOnHigherTier(userToAdd.premium?.tier, premium.tier)) {
        throw new SafeError(
          "One of the users you are adding to your plan already has premium and cannot be added."
        );
      }
    }

    // Get current users connected to this premium
    const currentPremium = await prisma.premium.findUnique({
      where: { id: premium.id },
      select: { users: { select: { id: true, email: true } } },
    });
    const currentUsers = currentPremium?.users || [];

    // Determine which users to disconnect (those not in the new email list)
    const usersToDisconnect = currentUsers.filter(
      (u) => u.id !== userId && !uniqueEmails.includes(u.email)
    );

    // delete premium for other users when adding them to this premium plan
    // don't delete the premium for the current user
    await prisma.premium.deleteMany({
      where: {
        id: { not: premium.id },
        users: { some: { id: { in: otherUsers.map((u) => u.id) } } },
      },
    });

    // Update users: disconnect removed users and connect new users
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        users: {
          disconnect: usersToDisconnect.map((user) => ({ id: user.id })),
          connect: otherUsers.map((user) => ({ id: user.id })),
        },
      },
    });

    // Set pending invites to exactly match non-existing users in the email list
    // Exclude emails that belong to the user's own EmailAccount records
    const userEmailAccounts = new Set(
      user.emailAccounts?.map((ea) => ea.email) || []
    );
    const nonExistingUsers = uniqueEmails.filter(
      (email) =>
        !(users.some((u) => u.email === email) || userEmailAccounts.has(email))
    );
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        pendingInvites: {
          set: nonExistingUsers,
        },
      },
    });

    await syncPremiumSeats(premium.id);
  });

// export const switchLemonPremiumPlanAction = actionClientUser
//   .metadata({ name: "switchLemonPremiumPlan" })
//   .inputSchema(z.object({ premiumTier: z.nativeEnum(PremiumTier) }))
//   .action(async ({ ctx: { userId }, parsedInput: { premiumTier } }) => {
//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//       select: {
//         premium: {
//           select: { lemonSqueezySubscriptionId: true },
//         },
//       },
//     });

//     if (!user) throw new SafeError("User not found");
//     if (!user.premium?.lemonSqueezySubscriptionId)
//       throw new SafeError("You do not have a premium subscription");

//     const variantId = getVariantId({ tier: premiumTier });

//     await switchPremiumPlan(user.premium.lemonSqueezySubscriptionId, variantId);
//   });

export const adminChangePremiumStatusAction = adminActionClient
  .metadata({ name: "adminChangePremiumStatus" })
  .inputSchema(changePremiumStatusSchema)
  .action(
    async ({
      parsedInput: {
        email,
        period,
        count,
        emailAccountsAccess,
        lemonSqueezyCustomerId,
        upgrade,
      },
    }) => {
      const userToUpgrade = await prisma.emailAccount.findUnique({
        where: { email },
        select: {
          id: true,
          user: { select: { id: true, premiumId: true } },
        },
      });

      if (!userToUpgrade?.user) {
        throw new SafeError("User not found");
      }

      const lemonSqueezySubscriptionId: number | null = null;
      const lemonSqueezySubscriptionItemId: number | null = null;
      const lemonSqueezyOrderId: number | null = null;
      const lemonSqueezyProductId: number | null = null;
      const lemonSqueezyVariantId: number | null = null;

      if (upgrade) {
        const getRenewsAt = (period: PremiumTier): Date | null => {
          const now = new Date();
          switch (period) {
            case PremiumTier.BASIC_ANNUALLY:
            case PremiumTier.PRO_ANNUALLY:
            case PremiumTier.STARTER_ANNUALLY:
            case PremiumTier.PLUS_ANNUALLY:
            case PremiumTier.PROFESSIONAL_ANNUALLY:
              return new Date(now.getTime() + ONE_YEAR_MS * (count || 1));
            case PremiumTier.BASIC_MONTHLY:
            case PremiumTier.PRO_MONTHLY:
            case PremiumTier.STARTER_MONTHLY:
            case PremiumTier.PLUS_MONTHLY:
            case PremiumTier.PROFESSIONAL_MONTHLY:
            case PremiumTier.COPILOT_MONTHLY:
              return new Date(now.getTime() + ONE_MONTH_MS * (count || 1));
            case PremiumTier.LIFETIME:
              return new Date(now.getTime() + TEN_YEARS);
            default:
              return null;
          }
        };

        await upgradeToPremiumLemon({
          userId: userToUpgrade.user.id,
          tier: period,
          lemonSqueezyCustomerId: lemonSqueezyCustomerId || null,
          lemonSqueezySubscriptionId,
          lemonSqueezySubscriptionItemId,
          lemonSqueezyOrderId,
          lemonSqueezyProductId,
          lemonSqueezyVariantId,
          lemonSqueezyRenewsAt: getRenewsAt(period),
          emailAccountsAccess,
        });
      } else if (userToUpgrade.user.premiumId) {
        await cancelPremiumLemon({
          premiumId: userToUpgrade.user.premiumId,
          lemonSqueezyEndsAt: new Date(),
        });
      } else {
        throw new SafeError("User not premium.");
      }
    }
  );

export const claimPremiumAdminAction = actionClientUser
  .metadata({ name: "claimPremiumAdmin" })
  .action(async ({ ctx: { userId } }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { premium: { select: { id: true, admins: true } } },
    });

    if (!user) {
      throw new SafeError("User not found");
    }
    if (!user.premium?.id) {
      throw new SafeError("User does not have a premium");
    }
    if (user.premium?.admins.length) {
      throw new SafeError("Already has admin");
    }

    await prisma.premium.update({
      where: { id: user.premium.id },
      data: { admins: { connect: { id: userId } } },
    });
  });

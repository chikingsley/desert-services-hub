"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { EnableFeatureCard } from "@/components/EnableFeatureCard";
import { toastError, toastSuccess } from "@/components/Toast";
import { SectionDescription } from "@/components/Typography";
import { SystemType } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  enableDraftRepliesAction,
  toggleRuleAction,
} from "@/utils/actions/rule";
import {
  markOnboardingAsCompleted,
  REPLY_ZERO_ONBOARDING_COOKIE,
} from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { CONVERSATION_STATUS_TYPES } from "@/utils/reply-tracker/conversation-status-config";
import { getRuleLabel } from "@/utils/rule/consts";

export function EnableReplyTracker({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { emailAccountId } = useAccount();

  return (
    <EnableFeatureCard
      buttonText={enabled ? "Got it!" : "Enable Reply Zero"}
      description={
        <>
          Your inbox is filled with emails that don't need your attention.
          <br />
          Reply Zero only shows you the ones that do.
        </>
      }
      extraDescription={
        <div className="mt-4 text-left">
          <SectionDescription>We label your emails with:</SectionDescription>

          <SectionDescription>
            <Badge color="green">{getRuleLabel(SystemType.TO_REPLY)}</Badge> -
            emails you need to reply to.
          </SectionDescription>
          <SectionDescription>
            <Badge color="blue">
              {getRuleLabel(SystemType.AWAITING_REPLY)}
            </Badge>{" "}
            - emails where you're waiting for a response.
          </SectionDescription>

          <SectionDescription className="mt-4">
            You can also enable auto-drafting of replies that appear in your
            inbox.
          </SectionDescription>
        </div>
      }
      imageAlt="Reply tracking"
      imageSrc="/images/illustrations/communication.svg"
      onEnable={async () => {
        markOnboardingAsCompleted(REPLY_ZERO_ONBOARDING_COOKIE);

        if (enabled) {
          router.push(prefixPath(emailAccountId, "/reply-zero"));
          return;
        }

        const promises = [
          ...CONVERSATION_STATUS_TYPES.map((systemType) =>
            toggleRuleAction(emailAccountId, {
              enabled: true,
              systemType,
            })
          ),
          enableDraftRepliesAction(emailAccountId, { enable: true }),
        ];

        const result = await Promise.race(promises);

        if (result?.serverError) {
          toastError({
            title: "Error enabling Reply Zero",
            description: result.serverError,
          });
        } else {
          toastSuccess({
            title: "Reply Zero enabled",
            description: "We've enabled Reply Zero for you!",
          });
        }

        router.push(prefixPath(emailAccountId, "/reply-zero?enabled=true"));
      }}
      title="Reply Zero"
    />
  );
}

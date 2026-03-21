import {
  buildContractReviewActionPlan,
  contractReviewOutputSchema,
} from "./contracts/review-output";
import { WRITABLE_MAILBOXES } from "@lib/graph/mailbox-permissions";
import { logger, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";

const recipientSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).optional(),
});

const deliverySchema = z
  .object({
    cc: z.array(recipientSchema).optional(),
    draft: z.boolean().default(true),
    mailbox: z.enum(WRITABLE_MAILBOXES),
    to: z.array(recipientSchema).min(1),
  })
  .optional();

const INPUT_SCHEMA = z.object({
  dryRun: z.boolean().default(true),
  emailDelivery: z
    .object({
      gcResponse: deliverySchema,
      internalHandoff: deliverySchema,
    })
    .optional(),
  review: contractReviewOutputSchema,
});

function canDraftInternal(review: z.infer<typeof contractReviewOutputSchema>) {
  return Boolean(review.internalEmail);
}

function canDraftGc(review: z.infer<typeof contractReviewOutputSchema>) {
  return Boolean(review.gcResponse);
}

export const contractsReviewRoute = schemaTask({
  id: "contracts-review-route",
  schema: INPUT_SCHEMA,
  maxDuration: 120,
  retry: { maxAttempts: 2 },
  run: async (input) => {
    const actionPlan = buildContractReviewActionPlan(input.review);
    const triggered: Array<{
      draft?: boolean;
      runId?: string;
      task: string;
    }> = [];

    if (!input.dryRun && input.emailDelivery?.internalHandoff && canDraftInternal(input.review)) {
      const payload = input.review.internalEmail!;
      const handle = await tasks.trigger("contracts-email-draft", {
        cc: input.emailDelivery.internalHandoff.cc,
        draft: input.emailDelivery.internalHandoff.draft,
        mailbox: input.emailDelivery.internalHandoff.mailbox,
        to: input.emailDelivery.internalHandoff.to,
        ...payload,
        templateType: "internal-handoff",
      });

      triggered.push({
        draft: input.emailDelivery.internalHandoff.draft,
        runId: handle.id,
        task: "contracts-email-draft",
      });
    }

    if (!input.dryRun && input.emailDelivery?.gcResponse && canDraftGc(input.review)) {
      const payload = input.review.gcResponse!;
      const handle = await tasks.trigger("contracts-email-draft", {
        cc: input.emailDelivery.gcResponse.cc,
        draft: input.emailDelivery.gcResponse.draft,
        mailbox: input.emailDelivery.gcResponse.mailbox,
        to: input.emailDelivery.gcResponse.to,
        ...payload,
        templateType: "markup-response",
      });

      triggered.push({
        draft: input.emailDelivery.gcResponse.draft,
        runId: handle.id,
        task: "contracts-email-draft",
      });
    }

    logger.info("contract review routed", {
      dryRun: input.dryRun,
      outcome: input.review.outcome,
      packetId: input.review.context?.packetId,
      projectId: input.review.context?.projectId,
      triggeredTasks: triggered.map((item) => item.task),
    });

    return {
      actionPlan,
      availableDrafts: {
        gcResponse: canDraftGc(input.review),
        internalHandoff: canDraftInternal(input.review),
      },
      dryRun: input.dryRun,
      outcome: input.review.outcome,
      reviewSummary: input.review.reviewSummary,
      triggered,
    };
  },
});

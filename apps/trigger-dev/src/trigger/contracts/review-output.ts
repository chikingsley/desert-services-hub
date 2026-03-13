import { z } from "zod";

export const contractReviewOutcomeSchema = z.enum([
  "needs_estimate_update",
  "needs_gc_clarification",
  "ready_to_sign",
  "contract_signed",
]);

export const internalContractsStatusSchema = z.enum([
  "ready_to_sign",
  "contract_in_progress",
  "contract_signed",
]);

export const revisionItemTypeSchema = z.enum([
  "MARKUP",
  "CLARIFICATION",
  "QUESTION",
  "SOV",
  "EXCLUSION",
]);

export const revisionItemSchema = z.object({
  text: z.string().trim().min(1),
  type: revisionItemTypeSchema,
  where: z.string().trim().min(1).optional(),
});

export const serviceSectionSchema = z.object({
  lines: z.array(z.string().trim().min(1)).min(1),
  mentions: z.array(z.string().trim().min(1)).optional(),
  serviceName: z.string().trim().min(1),
});

export const contractReviewContextSchema = z.object({
  estimateId: z.number().int().positive().optional(),
  mondayItemId: z.string().trim().min(1).optional(),
  packetId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
  sourceEmailId: z.number().int().positive().optional(),
});

export const internalHandoffPayloadSchema = z.object({
  accountLabel: z.string().trim().min(1).optional(),
  accountName: z.string().trim().min(1).optional(),
  additionalNotes: z.array(z.string().trim().min(1)).optional(),
  assignmentNote: z.string().trim().min(1).optional(),
  billingMentions: z.array(z.string().trim().min(1)).optional(),
  billingNotes: z.array(z.string().trim().min(1)).optional(),
  certifiedPayrollNote: z.string().trim().min(1).optional(),
  certifiedPayrollRequired: z.boolean().optional(),
  contacts: z.array(z.string().trim().min(1)).optional(),
  mondayNote: z.string().trim().min(1).optional(),
  primaryContact: z.string().trim().min(1).optional(),
  primaryContactLabel: z.string().trim().min(1).optional(),
  projectAddress: z.string().trim().min(1).optional(),
  projectName: z.string().trim().min(1),
  quickbooksNote: z.string().trim().min(1).optional(),
  routingNotes: z.array(z.string().trim().min(1)).optional(),
  serviceSections: z.array(serviceSectionSchema).min(1),
  sovTotal: z.string().trim().min(1).optional(),
  status: internalContractsStatusSchema,
  statusNote: z.string().trim().min(1).optional(),
});

export const gcResponsePayloadSchema = z.object({
  attachmentNote: z.string().trim().min(1).optional(),
  introLine: z.string().trim().min(1).optional(),
  projectName: z.string().trim().min(1),
  recipientName: z.string().trim().min(1).optional(),
  revisions: z.array(revisionItemSchema).min(1),
  subjectPrefix: z.string().trim().min(1).optional(),
});

export const estimatorKickbackPayloadSchema = z.object({
  reasons: z.array(z.string().trim().min(1)).min(1),
  requestedAction: z
    .enum(["review_and_update_estimate"])
    .default("review_and_update_estimate"),
  summary: z.string().trim().min(1),
});

export const contractReviewOutputSchema = z
  .object({
    context: contractReviewContextSchema.optional(),
    estimateMatchesContract: z.boolean(),
    estimateUpdateNeeded: z.boolean(),
    estimatorKickback: estimatorKickbackPayloadSchema.optional(),
    gcResponse: gcResponsePayloadSchema.optional(),
    internalEmail: internalHandoffPayloadSchema.optional(),
    nextAction: z.string().trim().min(1).optional(),
    outcome: contractReviewOutcomeSchema,
    reviewNotes: z.array(z.string().trim().min(1)).optional(),
    reviewSummary: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.estimateUpdateNeeded && !value.estimatorKickback) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "estimatorKickback is required when estimateUpdateNeeded is true",
        path: ["estimatorKickback"],
      });
    }

    if (value.outcome === "needs_estimate_update") {
      if (!value.estimateUpdateNeeded) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "needs_estimate_update outcome requires estimateUpdateNeeded = true",
          path: ["estimateUpdateNeeded"],
        });
      }
      if (value.estimateMatchesContract) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "needs_estimate_update outcome requires estimateMatchesContract = false",
          path: ["estimateMatchesContract"],
        });
      }
    }

    if (value.outcome === "needs_gc_clarification" && !value.gcResponse) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "gcResponse is required when outcome is needs_gc_clarification",
        path: ["gcResponse"],
      });
    }

    if (
      (value.outcome === "ready_to_sign" ||
        value.outcome === "contract_signed") &&
      !value.estimateMatchesContract
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ready_to_sign and contract_signed require estimateMatchesContract = true",
        path: ["estimateMatchesContract"],
      });
    }
  });

export const contractReviewActionTypeSchema = z.enum([
  "persist_review_output",
  "request_estimator_update",
  "draft_gc_response",
  "draft_internal_handoff",
  "update_monday",
  "queue_quickbooks_followup",
  "advance_contract_status",
]);

export const contractReviewActionSchema = z.object({
  description: z.string(),
  optional: z.boolean().default(false),
  payloadKey: z.string().trim().min(1).optional(),
  type: contractReviewActionTypeSchema,
});

export type ContractReviewOutput = z.infer<typeof contractReviewOutputSchema>;
export type ContractReviewAction = z.infer<typeof contractReviewActionSchema>;

export function buildContractReviewActionPlan(
  review: ContractReviewOutput
): ContractReviewAction[] {
  const actions: ContractReviewAction[] = [
    {
      description: "Persist the normalized review output for downstream tasks.",
      optional: false,
      payloadKey: "review",
      type: "persist_review_output",
    },
  ];

  if (review.outcome === "needs_estimate_update") {
    actions.push(
      {
        description:
          "Send the mismatch summary to estimating for estimate/SOV updates.",
        optional: false,
        payloadKey: "estimatorKickback",
        type: "request_estimator_update",
      },
      {
        description:
          "Advance the packet/project to a waiting-on-estimating state.",
        optional: false,
        type: "advance_contract_status",
      }
    );
    return actions;
  }

  if (review.outcome === "needs_gc_clarification") {
    actions.push(
      {
        description: "Draft the GC clarification / markup response email.",
        optional: false,
        payloadKey: "gcResponse",
        type: "draft_gc_response",
      },
      {
        description:
          "Draft the internalcontracts update so the team sees contract progress.",
        optional: !review.internalEmail,
        payloadKey: review.internalEmail ? "internalEmail" : undefined,
        type: "draft_internal_handoff",
      },
      {
        description:
          "Advance the packet/project to a sent-back / awaiting-counterparty state.",
        optional: false,
        type: "advance_contract_status",
      }
    );
    return actions;
  }

  actions.push(
    {
      description:
        review.outcome === "ready_to_sign"
          ? "Draft the internalcontracts ready-to-sign email."
          : "Draft the internalcontracts contract-signed email.",
      optional: !review.internalEmail,
      payloadKey: review.internalEmail ? "internalEmail" : undefined,
      type: "draft_internal_handoff",
    },
    {
      description: "Queue Monday updates from the approved review result.",
      optional: false,
      type: "update_monday",
    },
    {
      description:
        "Queue QuickBooks follow-up based on the approved review result.",
      optional: false,
      type: "queue_quickbooks_followup",
    },
    {
      description:
        review.outcome === "ready_to_sign"
          ? "Advance the packet/project to routing for signature."
          : "Advance the packet/project to executed / signed.",
      optional: false,
      type: "advance_contract_status",
    }
  );

  return actions;
}

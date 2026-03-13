import {
  contractMarkupResponseEmail,
  internalContractsHandoffEmail,
  type SignatureBlock,
} from "./contracts/email-templates";
import {
  internalContractsStatusSchema,
  revisionItemSchema,
  serviceSectionSchema,
} from "./contracts/review-output";
import {
  createComposeClient,
} from "@lib/graph/compose";
import {
  WRITABLE_MAILBOXES,
  type WritableMailbox,
} from "@lib/graph/mailbox-permissions";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const recipientSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).optional(),
});

const signatureSchema = z
  .object({
    email: z.email().optional(),
    mailbox: z.enum(WRITABLE_MAILBOXES).optional(),
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
  })
  .optional();

const commonSchema = z.object({
  cc: z.array(recipientSchema).optional(),
  draft: z.boolean().default(true),
  mailbox: z.enum(WRITABLE_MAILBOXES).default("chi@desertservices.net"),
  to: z.array(recipientSchema).min(1),
});

const markupSchema = commonSchema.extend({
  attachmentNote: z.string().trim().min(1).optional(),
  introLine: z.string().trim().min(1).optional(),
  projectName: z.string().trim().min(1),
  recipientName: z.string().trim().min(1).optional(),
  revisions: z.array(revisionItemSchema).min(1),
  signature: signatureSchema,
  subjectPrefix: z.string().trim().min(1).optional(),
  templateType: z.literal("markup-response"),
});

const internalSchema = commonSchema.extend({
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
  signature: signatureSchema,
  sovTotal: z.string().trim().min(1).optional(),
  status: internalContractsStatusSchema,
  statusNote: z.string().trim().min(1).optional(),
  templateType: z.literal("internal-handoff"),
});

const INPUT_SCHEMA = z.discriminatedUnion("templateType", [
  markupSchema,
  internalSchema,
]);

function normalizeSignature(
  signature: SignatureBlock | undefined,
  mailbox: WritableMailbox
): SignatureBlock {
  return {
    ...signature,
    mailbox,
    email: signature?.email ?? mailbox,
  };
}

export const contractsEmailDraft = schemaTask({
  id: "contracts-email-draft",
  schema: INPUT_SCHEMA,
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  run: async (input) => {
    const compose = createComposeClient();
    const signature = normalizeSignature(input.signature, input.mailbox);

    const template =
      input.templateType === "markup-response"
        ? contractMarkupResponseEmail({
            attachmentNote: input.attachmentNote,
            introLine: input.introLine,
            projectName: input.projectName,
            recipientName: input.recipientName,
            revisions: input.revisions,
            signature,
            subjectPrefix: input.subjectPrefix,
          })
        : internalContractsHandoffEmail({
            accountLabel: input.accountLabel,
            accountName: input.accountName,
            additionalNotes: input.additionalNotes,
            assignmentNote: input.assignmentNote,
            billingMentions: input.billingMentions,
            billingNotes: input.billingNotes,
            certifiedPayrollNote: input.certifiedPayrollNote,
            certifiedPayrollRequired: input.certifiedPayrollRequired,
            contacts: input.contacts,
            mondayNote: input.mondayNote,
            primaryContact: input.primaryContact,
            primaryContactLabel: input.primaryContactLabel,
            projectAddress: input.projectAddress,
            projectName: input.projectName,
            quickbooksNote: input.quickbooksNote,
            routingNotes: input.routingNotes,
            serviceSections: input.serviceSections,
            signature,
            sovTotal: input.sovTotal,
            status: input.status,
            statusNote: input.statusNote,
          });

    const draft = await compose.createDraft({
      userId: input.mailbox,
      subject: template.subject,
      body: template.body,
      bodyType: "html",
      to: input.to,
      cc: input.cc,
      skipSignature: true,
    });

    if (!input.draft) {
      await compose.sendDraft(draft.id, input.mailbox);
    }

    logger.info("contracts email draft created", {
      draft: input.draft,
      draftId: draft.id,
      mailbox: input.mailbox,
      subject: template.subject,
      templateType: input.templateType,
      to: input.to.map((recipient) => recipient.email),
    });

    return {
      body: template.body,
      draftId: draft.id,
      mailbox: input.mailbox,
      sent: !input.draft,
      subject: template.subject,
      templateType: input.templateType,
    };
  },
});

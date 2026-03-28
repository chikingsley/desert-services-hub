import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { createComposeClient } from "../lib/graph-compose";
import { LOGO_ATTACHMENT } from "../lib/logo";
import { submittedBillingWorkflowResultSchema } from "../lib/schemas";
import type { SubmittedBillingContext } from "../lib/schemas";

export interface SubmittedBillingWorkflowEnv {
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
}

export class SubmittedBillingWorkflow extends WorkflowEntrypoint<
  SubmittedBillingWorkflowEnv,
  SubmittedBillingContext
> {
  async run(event: WorkflowEvent<SubmittedBillingContext>, step: WorkflowStep): Promise<unknown> {
    const compose = createComposeClient(this.env);

    const draft = await step.do(
      "create draft",
      async () =>
        await compose.createDraft({
          body: event.payload.bodyHtml,
          bodyType: "html",
          cc: event.payload.cc,
          subject: event.payload.subject,
          to: event.payload.to,
          userId: event.payload.mailbox,
        }),
    );

    await step.do("attach logo", async () => {
      await compose.addFileAttachment({
        ...LOGO_ATTACHMENT,
        draftId: draft.id,
        userId: event.payload.mailbox,
      });
    });

    if (event.payload.send) {
      await step.do("send draft", async () => {
        await compose.sendDraft(draft.id, event.payload.mailbox);
      });
    }

    return submittedBillingWorkflowResultSchema.parse({
      classification: event.payload.classification,
      draftId: draft.id,
      invoiceNumber: event.payload.invoiceNumber,
      mode: event.payload.send ? "sent" : "draft",
      permitId: event.payload.permitId,
      subject: event.payload.subject,
    });
  }
}

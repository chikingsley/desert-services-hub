import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { createComposeClient } from "../lib/graph-compose";
import { LOGO_ATTACHMENT } from "../lib/logo";
import { submittedClientWorkflowResultSchema } from "../lib/schemas";
import type { SubmittedClientContext } from "../lib/schemas";

export interface SubmittedClientWorkflowEnv {
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
}

export class SubmittedClientWorkflow extends WorkflowEntrypoint<
  SubmittedClientWorkflowEnv,
  SubmittedClientContext
> {
  async run(event: WorkflowEvent<SubmittedClientContext>, step: WorkflowStep): Promise<unknown> {
    const compose = createComposeClient(this.env);

    const draft = await step.do("create draft", async () => {
      if (event.payload.route.mode === "reply-all") {
        const replyDraft = await compose.createReplyAllDraft({
          messageId: event.payload.route.replyToMessageId,
          userId: event.payload.mailbox,
        });
        await compose.updateDraft({
          body: event.payload.bodyHtml,
          bodyType: "html",
          draftId: replyDraft.id,
          userId: event.payload.mailbox,
        });
        return replyDraft;
      }

      return await compose.createDraft({
        body: event.payload.bodyHtml,
        bodyType: "html",
        subject: event.payload.route.subject,
        to: event.payload.route.to,
        userId: event.payload.mailbox,
      });
    });

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

    return submittedClientWorkflowResultSchema.parse({
      draftId: draft.id,
      mode: event.payload.send ? "sent" : "draft",
      permitId: event.payload.permitId,
      route: event.payload.route.mode,
      subject: draft.subject || event.payload.route.subject,
    });
  }
}

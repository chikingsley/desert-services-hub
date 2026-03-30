import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { createComposeClient } from "../lib/graph-compose";
import { LOGO_ATTACHMENT } from "../lib/logo";
import { issuedClientWorkflowResultSchema } from "../lib/schemas";
import type { IssuedClientContext } from "../lib/schemas";

export interface IssuedClientWorkflowEnv {
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
}

export class IssuedClientWorkflow extends WorkflowEntrypoint<
  IssuedClientWorkflowEnv,
  IssuedClientContext
> {
  async run(event: WorkflowEvent<IssuedClientContext>, step: WorkflowStep): Promise<unknown> {
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

    if (event.payload.attachments.length > 0) {
      await step.do("attach permit files", async () => {
        for (const attachment of event.payload.attachments) {
          await compose.addFileAttachment({
            contentBytesBase64: attachment.contentBytesBase64,
            contentType: attachment.contentType,
            draftId: draft.id,
            name: attachment.name,
            userId: event.payload.mailbox,
          });
        }
      });
    }

    if (event.payload.send) {
      await step.do("send draft", async () => {
        await compose.sendDraft(draft.id, event.payload.mailbox);
      });
    }

    return issuedClientWorkflowResultSchema.parse({
      draftId: draft.id,
      hasAttachments: event.payload.attachments.length > 0,
      mode: event.payload.send ? "sent" : "draft",
      permitId: event.payload.permitId,
      route: event.payload.route.mode,
      subject: draft.subject || event.payload.route.subject,
      type: event.payload.type,
    });
  }
}

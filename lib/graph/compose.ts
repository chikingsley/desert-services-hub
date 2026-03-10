import { graphPost } from "./http";

interface Recipient {
  email: string;
  name?: string;
}

interface GraphDraftMessage {
  id: string;
  subject: string;
}

interface GraphDraftAttachment {
  id: string;
  name?: string;
}

interface CreateDraftParams {
  body: string;
  bodyType: "html" | "text";
  cc?: Recipient[];
  skipSignature?: boolean;
  subject: string;
  to: Recipient[];
  userId: string;
}

interface CreateReplyDraftParams {
  body: string;
  bodyType: "html" | "text";
  messageId: string;
  replyAll?: boolean;
  skipSignature?: boolean;
  userId: string;
}

interface AddFileAttachmentParams {
  contentBytesBase64: string;
  contentType: string;
  draftId: string;
  name: string;
  userId: string;
}

export interface GraphComposeClient {
  addFileAttachment(
    params: AddFileAttachmentParams
  ): Promise<GraphDraftAttachment>;
  createDraft(params: CreateDraftParams): Promise<GraphDraftMessage>;
  createReplyDraft(params: CreateReplyDraftParams): Promise<GraphDraftMessage>;
  sendDraft(draftId: string, mailbox: string): Promise<void>;
}

function toGraphRecipients(
  recipients: Recipient[]
): Array<{ emailAddress: { address: string; name: string } }> {
  return recipients.map((r) => ({
    emailAddress: { address: r.email, name: r.name ?? r.email },
  }));
}

export function createComposeClient(): GraphComposeClient {
  return {
    addFileAttachment(
      params: AddFileAttachmentParams
    ): Promise<GraphDraftAttachment> {
      const user = encodeURIComponent(params.userId);
      const msg = encodeURIComponent(params.draftId);
      return graphPost<GraphDraftAttachment>(
        `users/${user}/messages/${msg}/attachments`,
        {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: params.name,
          contentType: params.contentType,
          contentBytes: params.contentBytesBase64,
        }
      );
    },

    createDraft(params: CreateDraftParams): Promise<GraphDraftMessage> {
      const user = encodeURIComponent(params.userId);
      return graphPost<GraphDraftMessage>(`users/${user}/messages`, {
        subject: params.subject,
        body: {
          contentType: params.bodyType === "html" ? "HTML" : "Text",
          content: params.body,
        },
        toRecipients: toGraphRecipients(params.to),
        ccRecipients: params.cc ? toGraphRecipients(params.cc) : [],
        isDraft: true,
      });
    },

    createReplyDraft(
      params: CreateReplyDraftParams
    ): Promise<GraphDraftMessage> {
      const user = encodeURIComponent(params.userId);
      const msg = encodeURIComponent(params.messageId);
      const endpoint = params.replyAll ? "createReplyAll" : "createReply";
      return graphPost<GraphDraftMessage>(
        `users/${user}/messages/${msg}/${endpoint}`,
        {
          comment: params.body,
        }
      );
    },

    async sendDraft(draftId: string, mailbox: string): Promise<void> {
      const user = encodeURIComponent(mailbox);
      const msg = encodeURIComponent(draftId);
      await graphPost(`users/${user}/messages/${msg}/send`, {});
    },
  };
}

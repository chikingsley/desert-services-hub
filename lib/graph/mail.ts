import { graphGet, graphGetBinary, graphPatch } from "./http";

export interface GraphEmailClient {
  downloadAttachment(
    messageId: string,
    attachmentId: string,
    mailboxEmail: string
  ): Promise<Buffer>;
  findLatestMessageIdByInternetMessageId(
    internetMessageId: string,
    mailboxEmail: string
  ): Promise<string | null>;
  getAttachments(
    messageId: string,
    mailboxEmail: string
  ): Promise<
    Array<{
      contentType?: string;
      id: string;
      isInline?: boolean;
      name: string;
      size?: number;
      }>
  >;
  getMessage(
    messageId: string,
    mailboxEmail: string
  ): Promise<{
    body?: {
      content?: string;
      contentType?: string;
    };
    ccRecipients?: Array<{
      emailAddress?: { address?: string; name?: string };
    }>;
    id: string;
    isRead?: boolean;
    subject?: string;
    toRecipients?: Array<{
      emailAddress?: { address?: string; name?: string };
    }>;
  }>;
  getMessageReadState(
    messageId: string,
    mailboxEmail: string
  ): Promise<boolean>;
  setMessageReadState(
    messageId: string,
    mailboxEmail: string,
    isRead: boolean
  ): Promise<void>;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function normalizeInternetMessageId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

export function createGraphClient(): GraphEmailClient {
  return {
    async findLatestMessageIdByInternetMessageId(
      internetMessageId: string,
      mailboxEmail: string
    ): Promise<string | null> {
      const normalized = normalizeInternetMessageId(internetMessageId);
      if (!normalized) {
        return null;
      }

      const user = encodeURIComponent(mailboxEmail);
      const filter = encodeURIComponent(
        `internetMessageId eq '${escapeODataString(normalized)}'`
      );
      const data = await graphGet<{
        value: Array<{
          hasAttachments?: boolean;
          id: string;
          receivedDateTime?: string;
        }>;
      }>(
        `users/${user}/messages?$filter=${filter}&$select=id,receivedDateTime,hasAttachments&$top=10`
      );

      const messages = [...data.value].sort((a, b) => {
        const aTime = Date.parse(a.receivedDateTime ?? "") || 0;
        const bTime = Date.parse(b.receivedDateTime ?? "") || 0;
        return bTime - aTime;
      });

      return messages.find((message) => message.hasAttachments)?.id ?? messages[0]?.id ?? null;
    },

    async getAttachments(
      messageId: string,
      mailboxEmail: string
    ): Promise<
      Array<{
        contentType?: string;
        id: string;
        isInline?: boolean;
        name: string;
        size?: number;
      }>
    > {
      const user = encodeURIComponent(mailboxEmail);
      const msg = encodeURIComponent(messageId);
      const data = await graphGet<{
        value: Array<{
          contentType?: string;
          id: string;
          isInline?: boolean;
          name: string;
          size?: number;
        }>;
      }>(
        `users/${user}/messages/${msg}/attachments?$select=id,name,contentType,size,isInline`
      );
      return data.value;
    },

    downloadAttachment(
      messageId: string,
      attachmentId: string,
      mailboxEmail: string
    ): Promise<Buffer> {
      const user = encodeURIComponent(mailboxEmail);
      const msg = encodeURIComponent(messageId);
      const att = encodeURIComponent(attachmentId);
      return graphGetBinary(
        `users/${user}/messages/${msg}/attachments/${att}/$value`
      );
    },

  getMessage(
    messageId: string,
    mailboxEmail: string
  ): Promise<{
    body?: {
      content?: string;
      contentType?: string;
    };
    ccRecipients?: Array<{
      emailAddress?: { address?: string; name?: string };
    }>;
      id: string;
      isRead?: boolean;
      subject?: string;
      toRecipients?: Array<{
        emailAddress?: { address?: string; name?: string };
      }>;
    }> {
      const user = encodeURIComponent(mailboxEmail);
      const msg = encodeURIComponent(messageId);
      return graphGet(
        `users/${user}/messages/${msg}?$select=id,subject,isRead,toRecipients,ccRecipients,body`
      );
    },

    async getMessageReadState(
      messageId: string,
      mailboxEmail: string
    ): Promise<boolean> {
      const user = encodeURIComponent(mailboxEmail);
      const msg = encodeURIComponent(messageId);
      const data = await graphGet<{ isRead?: boolean }>(
        `users/${user}/messages/${msg}?$select=isRead`
      );
      return data.isRead === true;
    },

    async setMessageReadState(
      messageId: string,
      mailboxEmail: string,
      isRead: boolean
    ): Promise<void> {
      const user = encodeURIComponent(mailboxEmail);
      const msg = encodeURIComponent(messageId);
      await graphPatch(`users/${user}/messages/${msg}`, { isRead });
    },
  };
}

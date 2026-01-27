/**
 * Email Service Types
 *
 * Core types for Microsoft Graph email operations including authentication,
 * message handling, attachments, search, and Microsoft 365 Groups.
 */

/**
 * Configuration for authenticating with Microsoft Graph API via Azure AD.
 * Used to initialize the GraphEmailClient with app-only or delegated auth.
 */
export interface EmailConfig {
  /** Azure AD tenant ID (directory ID) where the app is registered */
  azureTenantId: string;
  /** Application (client) ID from Azure AD app registration */
  azureClientId: string;
  /** Client secret generated in Azure AD app registration */
  azureClientSecret: string;
  /** Number of emails to fetch per API request (default: 100, max: 999) */
  batchSize?: number;
  /** Number of days back to search for emails (default: 30) */
  daysBack?: number;
}

/**
 * Represents an email recipient (sender, to, cc, bcc).
 * Used in both incoming and outgoing email operations.
 */
export interface Recipient {
  /** Display name of the recipient, null if not available */
  name: string | null;
  /** Email address of the recipient */
  email: string;
}

/**
 * Full representation of an email message from Microsoft Graph.
 * Contains all metadata and content from a retrieved email.
 */
export interface EmailMessage {
  /** Unique Microsoft Graph message ID */
  id: string;
  /** Email subject line */
  subject: string;
  /** Timestamp when the email was received */
  receivedDateTime: Date;
  /** Display name of the sender, null if not available */
  fromName: string | null;
  /** Email address of the sender */
  fromEmail: string;
  /** List of primary recipients (To field) */
  toRecipients: Recipient[];
  /** List of carbon copy recipients (CC field) */
  ccRecipients: Recipient[];
  /** Full body content of the email */
  bodyContent: string;
  /** Format of the body content */
  bodyType: "html" | "text";
  /** Whether the email has file attachments */
  hasAttachments?: boolean;
  /** ID linking related emails in the same thread */
  conversationId?: string;
  /** Outlook categories (color-coded labels) applied to this message */
  categories?: string[];
}

/**
 * Simplified email representation optimized for search results and listings.
 * Contains essential fields for displaying email summaries.
 */
export interface EmailResult {
  /** Unique Microsoft Graph message ID */
  id: string;
  /** Email subject line */
  subject: string;
  /** Display name of the sender */
  fromName?: string;
  /** Email address of the sender */
  fromEmail?: string;
  /** ISO 8601 timestamp when the email was received */
  receivedDateTime?: string;
  /** Short preview of the email body content */
  preview?: string;
}

/**
 * Search results grouped by mailbox.
 * Used when searching across multiple mailboxes in an organization.
 */
export interface MailboxResult {
  /** Email address of the mailbox that was searched */
  mailbox: string;
  /** Emails found in this mailbox matching the search criteria */
  emails: EmailResult[];
}

/**
 * Attachment metadata and content from a retrieved email.
 * Includes size and content information for download operations.
 */
export interface EmailAttachment {
  /** Unique Microsoft Graph attachment ID */
  id: string;
  /** Original filename of the attachment */
  name: string;
  /** MIME type of the attachment (e.g., "application/pdf") */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** Whether the attachment is embedded inline in the email body */
  isInline: boolean;
  /** Base64-encoded file content (only present when downloading) */
  contentBytes?: string;
  /** Content ID for inline images, referenced as cid:xxx in HTML body */
  contentId?: string;
}

/**
 * Email attachment with source tracking information.
 * Extends EmailAttachment to include the mailbox and message ID
 * from which the attachment was retrieved. This prevents userId mismatch
 * errors when downloading attachments from multi-mailbox searches.
 *
 * @example
 * // Get tracked attachments that remember their source
 * const attachments = await client.getTrackedAttachments(messageId, userId);
 * for (const att of attachments) {
 *   // Download will automatically use the correct userId
 *   const content = await client.safeDownloadAttachment(att);
 * }
 */
export type TrackedEmailAttachment = EmailAttachment & {
  /** Email address of the mailbox containing this attachment */
  sourceMailbox: string;
  /** Message ID of the email containing this attachment */
  sourceMessageId: string;
};

/**
 * Attachment data for sending emails.
 * Simplified version without server-assigned fields like id and size.
 */
export interface SendEmailAttachment {
  /** Filename for the attachment */
  name: string;
  /** MIME type of the attachment (e.g., "application/pdf") */
  contentType: string;
  /** Base64-encoded file content */
  contentBytes: string;
  /** Content ID for inline images, referenced as cid:xxx in HTML body */
  contentId?: string;
  /** Whether the attachment should be embedded inline in the email body */
  isInline?: boolean;
}

/**
 * Search options for email queries using KQL (Keyword Query Language).
 * Supports filtering by content, sender, attachments, and date ranges.
 *
 * @example
 * // Search by subject
 * { query: "subject:invoice" }
 *
 * @example
 * // Search by sender
 * { query: "from:john@example.com" }
 *
 * @example
 * // Search emails with attachments
 * { query: "hasAttachments:true" }
 *
 * @example
 * // Search email body content
 * { query: "body:project update" }
 *
 * @example
 * // Search by attachment filename
 * { query: "attachment:report.pdf" }
 */
export interface EmailSearchOptions {
  /** KQL query string for searching emails */
  query: string;
  /** Target user's email address - required for app auth, optional for user auth */
  userId?: string;
  /** Maximum number of results to return (default: 50, max: 1000) */
  limit?: number;
  /** Filter to only include emails received after this date */
  since?: Date;
  /** Filter to only include emails received before this date */
  until?: Date;
  /** Specific mail folder to search within */
  folder?: "inbox" | "sentitems" | "drafts" | "deleteditems";
}

/**
 * Options for composing and sending an email via Microsoft Graph.
 * Supports HTML/text body, multiple recipients, and attachments.
 */
export interface SendEmailOptions {
  /** Primary recipients (To field) */
  to: Array<{ email: string; name?: string }>;
  /** Carbon copy recipients (CC field) */
  cc?: Array<{ email: string; name?: string }>;
  /** Email subject line */
  subject: string;
  /** Email body content */
  body: string;
  /** Format of the body content (default: "text") */
  bodyType?: "html" | "text";
  /** Single attachment (use attachments[] for multiple or inline) */
  attachment?: {
    /** Filename for the attachment */
    name: string;
    /** MIME type of the attachment */
    contentType: string;
    /** Base64-encoded file content */
    contentBytes: string;
  };
  /** Multiple attachments with full inline image support */
  attachments?: SendEmailAttachment[];
  /** Skip auto-signature (default: false - signature is added automatically) */
  skipSignature?: boolean;
}

/**
 * A single post (message) within a Microsoft 365 Group conversation thread.
 * Represents one reply or the initial message in a group discussion.
 */
export interface GroupPost {
  /** Unique Microsoft Graph post ID */
  id: string;
  /** Author of the post */
  from: {
    /** Display name of the post author */
    name: string;
    /** Email address of the post author */
    address: string;
  };
  /** ISO 8601 timestamp when the post was received */
  receivedDateTime: string;
  /** Full body content of the post */
  bodyContent: string;
  /** Format of the body content */
  bodyType: "html" | "text";
  /** Whether the post has file attachments */
  hasAttachments: boolean;
  /** Attachments on this post (populated when requested) */
  attachments?: GroupAttachment[];
}

/**
 * Attachment on a Microsoft 365 Group post.
 * Similar to email attachments but specific to group conversations.
 */
export interface GroupAttachment {
  /** Unique Microsoft Graph attachment ID */
  id: string;
  /** Original filename of the attachment */
  name: string;
  /** MIME type of the attachment */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** Base64-encoded file content (only present when downloading) */
  contentBytes?: string;
}

/**
 * A thread within a Microsoft 365 Group conversation.
 * Contains a sequence of related posts (replies) on a single topic.
 */
export interface GroupThread {
  /** Unique Microsoft Graph thread ID */
  id: string;
  /** Subject/topic of the thread */
  topic: string;
  /** Whether any post in the thread has attachments */
  hasAttachments: boolean;
  /** ISO 8601 timestamp of the most recent post in the thread */
  lastDeliveredDateTime: string;
  /** All posts (messages) in this thread */
  posts: GroupPost[];
}

/**
 * A conversation in a Microsoft 365 Group.
 * Top-level container for discussion threads on a shared topic.
 */
export interface GroupConversation {
  /** Unique Microsoft Graph conversation ID */
  id: string;
  /** Subject/topic of the conversation */
  topic: string;
  /** Whether any thread in the conversation has attachments */
  hasAttachments: boolean;
  /** ISO 8601 timestamp of the most recent activity */
  lastDeliveredDateTime: string;
  /** All threads within this conversation */
  threads: GroupThread[];
}

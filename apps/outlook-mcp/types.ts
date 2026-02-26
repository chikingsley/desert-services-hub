/**
 * Outlook MCP Server Types
 *
 * Core types for Microsoft Graph API operations including authentication,
 * email handling, calendar events, folders, and rules.
 */

/**
 * Configuration for authenticating with Microsoft Graph API via Azure AD.
 * Uses client credentials flow (app-only auth) - no user interaction needed.
 */
export interface AuthConfig {
  /** Application (client) ID from Azure AD app registration */
  clientId: string;
  /** Client secret generated in Azure AD app registration */
  clientSecret: string;
  /** Required OAuth scopes for Microsoft Graph */
  scopes: string[];
  /** Azure AD tenant ID */
  tenantId: string;
  /** File path where tokens are stored */
  tokenStorePath: string;
}

/**
 * Server configuration for the Outlook MCP server.
 */
export interface Config {
  /** Authentication configuration */
  AUTH_CONFIG: AuthConfig;
  /** Default number of items per page */
  DEFAULT_PAGE_SIZE: number;
  /** Default timezone for calendar operations */
  DEFAULT_TIMEZONE: string;
  /** Fields to select when reading email details */
  EMAIL_DETAIL_FIELDS: string;
  /** Fields to select when listing emails */
  EMAIL_SELECT_FIELDS: string;
  /** Microsoft Graph API endpoint */
  GRAPH_API_ENDPOINT: string;
  /** Maximum number of results to return */
  MAX_RESULT_COUNT: number;
  /** Server name identifier */
  SERVER_NAME: string;
  /** Server version */
  SERVER_VERSION: string;
  /** Whether test mode is enabled */
  USE_TEST_MODE: boolean;
}

/**
 * Represents an email address with optional display name.
 */
export interface EmailAddress {
  /** Email address */
  address: string;
  /** Display name of the recipient */
  name?: string;
}

/**
 * Wrapper for email address used in Microsoft Graph API responses.
 */
export interface EmailRecipient {
  emailAddress: EmailAddress;
}

/**
 * Email body content.
 */
export interface EmailBody {
  /** The actual content */
  content: string;
  /** Content type: "text" or "html" */
  contentType: "text" | "html";
}

/**
 * Full representation of an email message from Microsoft Graph.
 */
export interface EmailMessage {
  /** Blind carbon copy recipients (BCC field) */
  bccRecipients?: EmailRecipient[];
  /** Full email body */
  body?: EmailBody;
  /** Short preview of the email body */
  bodyPreview: string;
  /** Carbon copy recipients (CC field) */
  ccRecipients: EmailRecipient[];
  /** Sender information */
  from: EmailRecipient;
  /** Whether the email has attachments */
  hasAttachments: boolean;
  /** Unique Microsoft Graph message ID */
  id: string;
  /** Email importance level */
  importance: "low" | "normal" | "high";
  /** Internet message headers */
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  /** Whether the email has been read */
  isRead: boolean;
  /** Timestamp when the email was received */
  receivedDateTime: string;
  /** Email subject line */
  subject: string;
  /** Primary recipients (To field) */
  toRecipients: EmailRecipient[];
}

/**
 * Calendar event location.
 */
export interface EventLocation {
  /** Physical address */
  address?: {
    street?: string;
    city?: string;
    state?: string;
    countryOrRegion?: string;
    postalCode?: string;
  };
  /** Display name of the location */
  displayName?: string;
  /** Location type */
  locationType?: string;
  /** Location URI */
  locationUri?: string;
}

/**
 * Date/time with timezone information.
 */
export interface DateTimeTimeZone {
  /** ISO 8601 date-time string */
  dateTime: string;
  /** Timezone identifier */
  timeZone: string;
}

/**
 * Calendar event attendee.
 */
export interface Attendee {
  /** Email address of the attendee */
  emailAddress: EmailAddress;
  /** Response status */
  status?: {
    response:
      | "none"
      | "organizer"
      | "tentativelyAccepted"
      | "accepted"
      | "declined"
      | "notResponded";
    time?: string;
  };
  /** Type of attendee */
  type?: "required" | "optional" | "resource";
}

/**
 * Calendar event from Microsoft Graph.
 */
export interface CalendarEvent {
  /** List of attendees */
  attendees?: Attendee[];
  /** Full event body */
  body?: EmailBody;
  /** Short preview of the event body */
  bodyPreview?: string;
  /** Event end time */
  end: DateTimeTimeZone;
  /** Unique Microsoft Graph event ID */
  id: string;
  /** Whether this is an all-day event */
  isAllDay?: boolean;
  /** Whether the event is cancelled */
  isCancelled?: boolean;
  /** Whether this is an online meeting */
  isOnlineMeeting?: boolean;
  /** Event location */
  location?: EventLocation;
  /** Online meeting URL */
  onlineMeetingUrl?: string;
  /** Event organizer */
  organizer?: EmailRecipient;
  /** Event start time */
  start: DateTimeTimeZone;
  /** Event subject/title */
  subject: string;
}

/**
 * Mail folder from Microsoft Graph.
 */
export interface MailFolder {
  /** Number of child folders */
  childFolderCount?: number;
  /** Display name of the folder */
  displayName: string;
  /** Unique folder ID */
  id: string;
  /** Parent folder ID */
  parentFolderId?: string;
  /** Total number of items */
  totalItemCount?: number;
  /** Number of unread items */
  unreadItemCount?: number;
}

/**
 * Message rule action.
 */
export interface RuleActions {
  /** Copy to folder ID */
  copyToFolder?: string;
  /** Delete the message */
  delete?: boolean;
  /** Forward as attachment to recipients */
  forwardAsAttachmentTo?: EmailRecipient[];
  /** Forward to recipients */
  forwardTo?: EmailRecipient[];
  /** Mark as read */
  markAsRead?: boolean;
  /** Mark importance level */
  markImportance?: "low" | "normal" | "high";
  /** Move to folder ID */
  moveToFolder?: string;
  /** Redirect to recipients */
  redirectTo?: EmailRecipient[];
  /** Stop processing more rules */
  stopProcessingRules?: boolean;
}

/**
 * Message rule conditions.
 */
export interface RuleConditions {
  /** Body contains these strings */
  bodyContains?: string[];
  /** From addresses */
  fromAddresses?: EmailRecipient[];
  /** Has attachments */
  hasAttachments?: boolean;
  /** Header contains these strings */
  headerContains?: string[];
  /** Importance level */
  importance?: "low" | "normal" | "high";
  /** Is meeting request */
  isMeetingRequest?: boolean;
  /** Is meeting response */
  isMeetingResponse?: boolean;
  /** Sender contains these strings */
  senderContains?: string[];
  /** Sent CC to me */
  sentCcMe?: boolean;
  /** Sent only to me */
  sentOnlyToMe?: boolean;
  /** Sent to me */
  sentToMe?: boolean;
  /** Subject contains these strings */
  subjectContains?: string[];
}

/**
 * Message rule from Microsoft Graph.
 */
export interface MessageRule {
  /** Actions to perform */
  actions?: RuleActions;
  /** Rule conditions */
  conditions?: RuleConditions;
  /** Display name of the rule */
  displayName: string;
  /** Exception conditions */
  exceptions?: RuleConditions;
  /** Unique rule ID */
  id: string;
  /** Whether the rule is enabled */
  isEnabled: boolean;
  /** Sequence number for rule order */
  sequence: number;
}

/**
 * Generic Microsoft Graph API response with array of values.
 */
export interface GraphApiListResponse<T> {
  /** Total count of items */
  "@odata.count"?: number;
  /** Next page link for pagination */
  "@odata.nextLink"?: string;
  /** Array of returned items */
  value: T[];
}

/**
 * Query parameters for Microsoft Graph API requests.
 */
export interface GraphApiQueryParams {
  /** Whether to include count */
  $count?: boolean;
  /** Expand related entities */
  $expand?: string;
  /** Filter expression */
  $filter?: string;
  /** Order by expression */
  $orderby?: string;
  /** Search expression */
  $search?: string;
  /** Fields to select */
  $select?: string;
  /** Number of items to skip */
  $skip?: number;
  /** Number of items to return */
  $top?: number;
  /** Additional parameters */
  [key: string]: string | number | boolean | undefined;
}

/**
 * HTTP methods supported by the Graph API client.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * JSON Schema for tool input parameters.
 */
export interface JsonSchema {
  additionalProperties?: boolean;
  items?: JsonSchema;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  type: string;
}

/**
 * Property definition in a JSON schema.
 */
export interface JsonSchemaProperty {
  default?: unknown;
  description?: string;
  enum?: string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  type: string;
}

/**
 * MCP Tool response format.
 */
export interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  /** Set to true when the tool encountered an error, so clients can distinguish failure from success */
  isError?: boolean;
}

/**
 * MCP Tool definition.
 */
export interface Tool {
  /** Tool description */
  description: string;
  /** Tool handler function */
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
  /** JSON Schema for input parameters */
  inputSchema: JsonSchema;
  /** Unique tool name */
  name: string;
}

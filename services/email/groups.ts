/**
 * Microsoft Graph Groups Client
 *
 * Handles conversations, threads, and posts (email chains) within M365 Groups.
 * This client uses app-only authentication via ClientSecretCredential.
 */
import { ClientSecretCredential } from "@azure/identity";
import type {
  GroupAttachment,
  GroupConversation,
  GroupPost,
  GroupThread,
} from "./types";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const DEFAULT_TOP = 50;
const DEFAULT_ORDER = "lastDeliveredDateTime desc";
const DEFAULT_MAX_CONVERSATIONS = 100;

interface GraphListResponse<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

interface GraphConversationRaw {
  id?: string;
  topic?: string;
  hasAttachments?: boolean;
  lastDeliveredDateTime?: string;
}

interface GraphThreadRaw {
  id?: string;
  topic?: string;
  hasAttachments?: boolean;
  lastDeliveredDateTime?: string;
}

interface GraphAttachmentRaw {
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  contentBytes?: string;
}

interface GraphPostRaw {
  id?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  body?: { content?: string; contentType?: string };
  hasAttachments?: boolean;
  attachments?: GraphAttachmentRaw[];
}

/**
 * Client for interacting with Microsoft 365 Group conversations via the Graph API.
 *
 * Provides methods to list groups, retrieve conversations, threads, posts,
 * and download attachments from M365 Groups.
 *
 * @example
 * const client = new GraphGroupsClient(
 *   process.env.AZURE_TENANT_ID,
 *   process.env.AZURE_CLIENT_ID,
 *   process.env.AZURE_CLIENT_SECRET
 * );
 *
 * // List all groups
 * const groups = await client.listGroups();
 *
 * // Get conversations from a group
 * const conversations = await client.getGroupConversations(groups[0].id);
 */
export class GraphGroupsClient {
  private readonly credential: ClientSecretCredential;

  /**
   * Creates a new GraphGroupsClient instance with Azure AD app credentials.
   *
   * @param tenantId - Azure AD tenant ID
   * @param clientId - Azure AD application (client) ID
   * @param clientSecret - Azure AD application client secret
   *
   * @example
   * const client = new GraphGroupsClient(
   *   'your-tenant-id',
   *   'your-client-id',
   *   'your-client-secret'
   * );
   */
  constructor(tenantId: string, clientId: string, clientSecret: string) {
    this.credential = new ClientSecretCredential(
      tenantId,
      clientId,
      clientSecret
    );
  }

  /**
   * Acquires an access token for the Microsoft Graph API.
   *
   * @returns The OAuth access token string
   */
  private async getToken(): Promise<string> {
    const result = await this.credential.getToken(GRAPH_SCOPE);
    return result.token;
  }

  /**
   * Makes an authenticated GET request to the Microsoft Graph API.
   *
   * @param endpoint - The API endpoint path (without base URL)
   * @returns The parsed JSON response
   * @throws Error if the request fails with status code and error details
   */
  private async graphGet<T>(endpoint: string): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${GRAPH_API_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Graph API error: ${response.status} - ${errorText}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Retrieves conversations in a Microsoft 365 Group with automatic pagination.
   *
   * Follows @odata.nextLink to fetch all conversations matching the criteria,
   * similar to how email sync handles pagination.
   *
   * @param groupId - The unique identifier of the M365 Group
   * @param options - Optional configuration for the request
   * @param options.since - Filter to only include conversations after this date
   * @param options.orderBy - Sort order for results (default: "lastDeliveredDateTime desc")
   * @param options.top - Maximum total results to return (stops pagination early). Omit to get all.
   * @param options.batchSize - Number of conversations per API request (default: 50)
   * @returns Array of group conversations with metadata (threads not populated)
   *
   * @example
   * // Get all conversations (auto-paginates)
   * const conversations = await client.getGroupConversations('group-id');
   *
   * @example
   * // Get only the 10 most recent conversations
   * const recent = await client.getGroupConversations('group-id', { top: 10 });
   *
   * @example
   * // Get conversations from the last 7 days
   * const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
   * const recentConvs = await client.getGroupConversations('group-id', {
   *   since: weekAgo
   * });
   */
  async getGroupConversations(
    groupId: string,
    options: {
      since?: Date;
      orderBy?: string;
      top?: number;
      batchSize?: number;
    } = {}
  ): Promise<GroupConversation[]> {
    const {
      orderBy = DEFAULT_ORDER,
      since,
      top,
      batchSize = DEFAULT_TOP,
    } = options;

    // If top is specified and smaller than batchSize, use top as the batch size
    const effectiveBatchSize = top && top < batchSize ? top : batchSize;

    let url = `/groups/${groupId}/conversations?$top=${effectiveBatchSize}&$orderby=${orderBy}`;
    if (since) {
      const dateFilter = `lastDeliveredDateTime ge ${since.toISOString()}`;
      url += `&$filter=${encodeURIComponent(dateFilter)}`;
    }

    const allConversations: GroupConversation[] = [];

    // Paginate through results
    while (url) {
      const response =
        await this.graphGet<GraphListResponse<GraphConversationRaw>>(url);

      const conversations = (response.value ?? [])
        .filter((conv) => conv.id)
        .map((conv) => ({
          id: conv.id as string,
          topic: conv.topic ?? "",
          hasAttachments: Boolean(conv.hasAttachments),
          lastDeliveredDateTime: conv.lastDeliveredDateTime ?? "",
          threads: [],
        }));

      allConversations.push(...conversations);

      // Stop if we've reached the requested limit
      if (top && allConversations.length >= top) {
        return allConversations.slice(0, top);
      }

      // Follow pagination link if present
      const nextLink = response["@odata.nextLink"];
      if (nextLink) {
        // nextLink is a full URL, extract just the path
        url = nextLink.replace(GRAPH_API_BASE, "");
      } else {
        break;
      }
    }

    return allConversations;
  }

  /**
   * Retrieves all threads within a specific conversation.
   *
   * @param groupId - The unique identifier of the M365 Group
   * @param conversationId - The unique identifier of the conversation
   * @returns Array of threads with metadata (posts not populated)
   *
   * @example
   * const threads = await client.getConversationThreads('group-id', 'conversation-id');
   * console.log(`Found ${threads.length} threads`);
   */
  async getConversationThreads(
    groupId: string,
    conversationId: string
  ): Promise<GroupThread[]> {
    const response = await this.graphGet<GraphListResponse<GraphThreadRaw>>(
      `/groups/${groupId}/conversations/${conversationId}/threads`
    );

    return (response.value ?? [])
      .filter((thread) => thread.id)
      .map((thread) => ({
        id: thread.id as string,
        topic: thread.topic ?? "",
        hasAttachments: Boolean(thread.hasAttachments),
        lastDeliveredDateTime: thread.lastDeliveredDateTime ?? "",
        posts: [],
      }));
  }

  /**
   * Retrieves all posts within a specific thread.
   *
   * @param groupId - The unique identifier of the M365 Group
   * @param threadId - The unique identifier of the thread
   * @param includeAttachments - Whether to expand and include attachment data (default: false)
   * @returns Array of posts with sender info, body content, and optionally attachments
   *
   * @example
   * // Get posts without attachments
   * const posts = await client.getThreadPosts('group-id', 'thread-id');
   *
   * @example
   * // Get posts with attachments expanded
   * const postsWithAttachments = await client.getThreadPosts('group-id', 'thread-id', true);
   */
  async getThreadPosts(
    groupId: string,
    threadId: string,
    includeAttachments = false
  ): Promise<GroupPost[]> {
    const base = `/groups/${groupId}/threads/${threadId}/posts`;
    const url = includeAttachments ? `${base}?$expand=attachments` : base;
    const response = await this.graphGet<GraphListResponse<GraphPostRaw>>(url);

    return (response.value ?? [])
      .map((post) => this.parseThreadPost(post, includeAttachments))
      .filter((p): p is GroupPost => Boolean(p));
  }

  /**
   * Retrieves the full MIME content of a post, including forwarded email chains.
   *
   * This is useful for extracting the complete email thread history that may be
   * embedded in forwarded messages.
   *
   * @param groupId - The unique identifier of the M365 Group
   * @param threadId - The unique identifier of the thread
   * @param postId - The unique identifier of the post
   * @returns The raw MIME content as a string
   * @throws Error if the request fails
   *
   * @example
   * const mimeContent = await client.getPostMimeContent('group-id', 'thread-id', 'post-id');
   * // Parse MIME content to extract forwarded message chain
   */
  async getPostMimeContent(
    groupId: string,
    threadId: string,
    postId: string
  ): Promise<string> {
    const token = await this.getToken();
    const url = `${GRAPH_API_BASE}/groups/${groupId}/threads/${threadId}/posts/${postId}/$value`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Graph API error getting MIME: ${response.status} - ${errorText}`
      );
    }

    return response.text();
  }

  /**
   * Parses a raw Graph API post response into a typed GroupPost object.
   *
   * @param post - The raw post data from the Graph API
   * @param includeAttachments - Whether to parse attachment data
   * @returns Parsed GroupPost object, or null if the post has no ID
   */
  private parseThreadPost(
    post: GraphPostRaw,
    includeAttachments: boolean
  ): GroupPost | null {
    if (!post.id) {
      return null;
    }

    const parsedPost: GroupPost = {
      id: post.id,
      from: {
        name: post.from?.emailAddress?.name ?? "",
        address: post.from?.emailAddress?.address ?? "",
      },
      receivedDateTime: post.receivedDateTime ?? "",
      bodyContent: post.body?.content ?? "",
      bodyType: post.body?.contentType === "html" ? "html" : "text",
      hasAttachments: Boolean(post.hasAttachments),
    };

    if (includeAttachments && post.attachments) {
      const attachments = this.parsePostAttachments(post.attachments);
      if (attachments.length > 0) {
        parsedPost.attachments = attachments;
      }
    }

    return parsedPost;
  }

  /**
   * Parses raw attachment data into typed GroupAttachment objects.
   *
   * @param atts - Array of raw attachment data from the Graph API
   * @returns Array of parsed GroupAttachment objects
   */
  private parsePostAttachments(atts: GraphAttachmentRaw[]): GroupAttachment[] {
    return atts
      .filter((att) => att.id && att.name && att.contentType)
      .map((att) => ({
        id: att.id as string,
        name: att.name as string,
        contentType: att.contentType as string,
        size: att.size ?? 0,
        contentBytes: att.contentBytes,
      }));
  }

  /**
   * Retrieves a complete conversation with all threads and posts populated.
   *
   * This method makes multiple API calls to fetch the full conversation hierarchy:
   * conversation -> threads -> posts (with optional attachments).
   *
   * @param groupId - The unique identifier of the M365 Group
   * @param conversationId - The unique identifier of the conversation
   * @param includeAttachments - Whether to include attachment data in posts (default: false)
   * @returns Complete conversation object with threads and posts populated
   *
   * @example
   * // Get full conversation without attachments
   * const conversation = await client.getFullConversation('group-id', 'conv-id');
   * console.log(`Topic: ${conversation.topic}`);
   * console.log(`Threads: ${conversation.threads.length}`);
   *
   * @example
   * // Get full conversation with attachments for downloading
   * const fullConv = await client.getFullConversation('group-id', 'conv-id', true);
   * for (const thread of fullConv.threads) {
   *   for (const post of thread.posts) {
   *     console.log(`Post from ${post.from.name} has ${post.attachments?.length ?? 0} attachments`);
   *   }
   * }
   */
  async getFullConversation(
    groupId: string,
    conversationId: string,
    includeAttachments = false
  ): Promise<GroupConversation> {
    const convResponse = await this.graphGet<GraphConversationRaw>(
      `/groups/${groupId}/conversations/${conversationId}`
    );

    const threads = await this.getConversationThreads(groupId, conversationId);

    // Fetch posts for each thread
    for (const thread of threads) {
      thread.posts = await this.getThreadPosts(
        groupId,
        thread.id,
        includeAttachments
      );
    }

    return {
      id: convResponse.id ?? conversationId,
      topic: convResponse.topic ?? "",
      hasAttachments: Boolean(convResponse.hasAttachments),
      lastDeliveredDateTime: convResponse.lastDeliveredDateTime ?? "",
      threads,
    };
  }

  /**
   * Lists all M365 Groups accessible to the authenticated application.
   *
   * Useful for discovering group IDs when you only know the display name.
   *
   * @returns Array of groups with their IDs and display names
   *
   * @example
   * const groups = await client.listGroups();
   * const targetGroup = groups.find(g => g.displayName === 'Estimating');
   * if (targetGroup) {
   *   console.log(`Group ID: ${targetGroup.id}`);
   * }
   */
  async listGroups(): Promise<{ id: string; displayName: string }[]> {
    const response = await this.graphGet<
      GraphListResponse<{ id?: string; displayName?: string }>
    >("/groups?$select=id,displayName&$top=100");
    return (response.value ?? [])
      .filter((g): g is { id: string; displayName: string } =>
        Boolean(g.id && g.displayName)
      )
      .map((g) => ({ id: g.id, displayName: g.displayName }));
  }

  /**
   * Downloads a specific attachment from a post.
   *
   * @param groupId - The unique identifier of the M365 Group
   * @param threadId - The unique identifier of the thread
   * @param postId - The unique identifier of the post
   * @param attachmentId - The unique identifier of the attachment
   * @returns Object containing attachment name, content type, and base64-encoded content
   *
   * @example
   * const attachment = await client.downloadAttachment(
   *   'group-id',
   *   'thread-id',
   *   'post-id',
   *   'attachment-id'
   * );
   * const buffer = Buffer.from(attachment.contentBytes, 'base64');
   * await Bun.write(`./downloads/${attachment.name}`, buffer);
   */
  async downloadAttachment(
    groupId: string,
    threadId: string,
    postId: string,
    attachmentId: string
  ): Promise<{ name: string; contentType: string; contentBytes: string }> {
    const response = await this.graphGet<{
      name?: string;
      contentType?: string;
      contentBytes?: string;
    }>(
      `/groups/${groupId}/threads/${threadId}/posts/${postId}/attachments/${attachmentId}`
    );

    return {
      name: response.name ?? "",
      contentType: response.contentType ?? "",
      contentBytes: response.contentBytes ?? "",
    };
  }

  /**
   * Downloads all conversations from a group to local files for offline analysis.
   *
   * Creates JSON files for each conversation and extracts PDF attachments
   * to a separate pdfs/ subdirectory.
   *
   * @param groupId - The unique identifier of the M365 Group
   * @param outputDir - Directory path where files will be saved
   * @param options - Optional configuration for the download
   * @param options.since - Only download conversations after this date
   * @param options.includeAttachments - Whether to download attachments (default: true)
   * @param options.maxConversations - Maximum number of conversations to download (default: 100)
   * @returns Promise that resolves when all downloads are complete
   *
   * @example
   * // Download all recent conversations
   * await client.downloadAllConversations('group-id', './data/conversations');
   *
   * @example
   * // Download conversations from the last 30 days
   * const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
   * await client.downloadAllConversations('group-id', './data/conversations', {
   *   since: monthAgo,
   *   maxConversations: 50,
   *   includeAttachments: true
   * });
   */
  async downloadAllConversations(
    groupId: string,
    outputDir: string,
    options: {
      since?: Date;
      includeAttachments?: boolean;
      maxConversations?: number;
    } = {}
  ): Promise<void> {
    const {
      since,
      includeAttachments = true,
      maxConversations = DEFAULT_MAX_CONVERSATIONS,
    } = options;

    console.log(
      `Downloading up to ${maxConversations} conversations from group ${groupId}...`
    );

    const conversations = await this.getGroupConversations(groupId, {
      top: maxConversations,
      since,
    });

    for (const [index, conv] of conversations.entries()) {
      console.log(
        `${index + 1}/${conversations.length}: ${conv.topic.slice(0, 60)}...`
      );

      const fullConv = await this.getFullConversation(
        groupId,
        conv.id,
        includeAttachments
      );

      // Write conversation JSON
      const safeTopic = conv.topic
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 50);
      const filename = `${outputDir}/conversation_${index + 1}_${safeTopic}.json`;
      await Bun.write(filename, JSON.stringify(fullConv, null, 2));

      // Write PDF attachments
      if (includeAttachments) {
        await this.savePdfAttachments(fullConv, outputDir);
      }
    }

    console.log(
      `Downloaded ${conversations.length} conversations to ${outputDir}`
    );
  }

  /**
   * Saves PDF attachments from a conversation to disk.
   *
   * @param conversation - The conversation containing posts with attachments
   * @param outputDir - Base directory where the pdfs/ subdirectory will be created
   * @returns Promise that resolves when all PDFs are saved
   */
  private async savePdfAttachments(
    conversation: GroupConversation,
    outputDir: string
  ): Promise<void> {
    for (const thread of conversation.threads) {
      for (const post of thread.posts) {
        for (const att of post.attachments ?? []) {
          if (att.contentType === "application/pdf" && att.contentBytes) {
            const pdfPath = `${outputDir}/pdfs/${att.name}`;
            const pdfBytes = Buffer.from(att.contentBytes, "base64");
            await Bun.write(pdfPath, pdfBytes);
          }
        }
      }
    }
  }
}

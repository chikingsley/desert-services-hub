import { graphGet } from "./http";

interface GroupThread {
  id: string;
}

interface GroupPostAttachment {
  contentBytes?: string;
  contentType?: string;
  id: string;
  name?: string;
}

interface GroupPost {
  attachments?: GroupPostAttachment[];
  id: string;
}

export interface GraphGroupsClient {
  getConversationThreads(
    groupId: string,
    conversationId: string
  ): Promise<GroupThread[]>;
  getThreadPosts(
    groupId: string,
    threadId: string,
    includeAttachments?: boolean
  ): Promise<GroupPost[]>;
}

export function createGroupsClient(): GraphGroupsClient {
  return {
    async getConversationThreads(
      groupId: string,
      conversationId: string
    ): Promise<GroupThread[]> {
      const g = encodeURIComponent(groupId);
      const c = encodeURIComponent(conversationId);
      const data = await graphGet<{ value: GroupThread[] }>(
        `groups/${g}/conversations/${c}/threads`
      );
      return data.value;
    },

    async getThreadPosts(
      groupId: string,
      threadId: string,
      includeAttachments = false
    ): Promise<GroupPost[]> {
      const g = encodeURIComponent(groupId);
      const t = encodeURIComponent(threadId);
      const expand = includeAttachments ? "?$expand=attachments" : "";
      const data = await graphGet<{ value: GroupPost[] }>(
        `groups/${g}/threads/${t}/posts${expand}`
      );
      return data.value;
    },
  };
}

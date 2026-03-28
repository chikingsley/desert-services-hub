import type { GraphAuthEnv } from "./graph-auth";
import { getGraphToken } from "./graph-auth";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

export interface GraphMessageSummary {
  conversationId?: string;
  from?: {
    emailAddress?: {
      address?: string;
      name?: string;
    };
  };
  hasAttachments?: boolean;
  id: string;
  internetMessageId?: string;
  parentFolderId?: string;
  receivedDateTime?: string;
  subject?: string;
}

export const fetchGraphMessageSummary = async (
  env: GraphAuthEnv,
  mailboxEmail: string,
  messageId: string,
): Promise<GraphMessageSummary> => {
  const token = await getGraphToken(env);
  const userPath = encodeURIComponent(mailboxEmail);
  const messagePath = encodeURIComponent(messageId);
  const url =
    `${GRAPH_API_BASE}/users/${userPath}/messages/${messagePath}` +
    "?$select=id,conversationId,parentFolderId,subject,receivedDateTime,from,hasAttachments,internetMessageId";

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Graph message fetch failed for ${mailboxEmail}/${messageId}: ${response.status}`,
    );
  }

  return (await response.json()) as GraphMessageSummary;
};

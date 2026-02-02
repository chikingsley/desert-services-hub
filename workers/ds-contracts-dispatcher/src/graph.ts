/**
 * Lightweight Microsoft Graph API client for Cloudflare Workers.
 * Uses fetch directly (no SDK dependency).
 */

export interface GraphEmail {
  id: string;
  subject: string;
  from: string;
  receivedDateTime: string;
  bodyContent: string;
}

interface GraphMessageResponse {
  value: Array<{
    id: string;
    subject: string;
    from: { emailAddress: { address: string; name: string } };
    receivedDateTime: string;
    body: { content: string; contentType: string };
  }>;
}

export async function getGraphToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Search a mailbox using KQL.
 */
export async function searchEmails(
  token: string,
  userId: string,
  query: string,
  limit = 10
): Promise<GraphEmail[]> {
  const url = `https://graph.microsoft.com/v1.0/users/${userId}/messages?$search="${encodeURIComponent(query)}"&$top=${limit}&$select=id,subject,from,receivedDateTime,body`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.log(`[Graph] Search failed for ${userId}: ${res.status}`);
    return [];
  }

  const data = (await res.json()) as GraphMessageResponse;
  return (data.value ?? []).map((msg) => ({
    id: msg.id,
    subject: msg.subject ?? "",
    from: msg.from?.emailAddress?.address ?? "",
    receivedDateTime: msg.receivedDateTime,
    bodyContent: msg.body?.content ?? "",
  }));
}

/**
 * Get a single email by ID with full body.
 */
export async function getEmail(
  token: string,
  userId: string,
  messageId: string
): Promise<GraphEmail | null> {
  const url = `https://graph.microsoft.com/v1.0/users/${userId}/messages/${messageId}?$select=id,subject,from,receivedDateTime,body`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return null;
  }

  const msg = (await res.json()) as {
    id: string;
    subject: string;
    from: { emailAddress: { address: string } };
    receivedDateTime: string;
    body: { content: string };
  };

  return {
    id: msg.id,
    subject: msg.subject ?? "",
    from: msg.from?.emailAddress?.address ?? "",
    receivedDateTime: msg.receivedDateTime,
    bodyContent: msg.body?.content ?? "",
  };
}

/**
 * Search multiple mailboxes in parallel.
 */
export async function searchMailboxes(
  token: string,
  mailboxes: string[],
  query: string,
  limit = 5
): Promise<Array<{ mailbox: string; emails: GraphEmail[] }>> {
  const results = await Promise.all(
    mailboxes.map(async (mailbox) => {
      const emails = await searchEmails(token, mailbox, query, limit);
      return { mailbox, emails };
    })
  );

  return results.filter((r) => r.emails.length > 0);
}

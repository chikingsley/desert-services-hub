/**
 * Microsoft Graph API client for delta queries.
 * Raw fetch — no SDK dependency. Works with Bun's built-in fetch.
 */

import {
  clearTokenCache,
  getGraphTokenCached as getAccessToken,
} from "@lib/graph/token";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export { getAccessToken };

export class DeltaExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeltaExpiredError";
  }
}

async function graphFetch(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let token = await getAccessToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 && attempt === 0) {
      clearTokenCache();
      token = await getAccessToken();
      const retry = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (retry.ok) {
        return retry;
      }
      throw new Error(`Graph 401 after token refresh: ${await retry.text()}`);
    }

    if (res.status === 410) {
      throw new DeltaExpiredError(
        "Delta token expired. Clear stored link and retry."
      );
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter
        ? Number.parseInt(retryAfter, 10) * 1000
        : 30_000;
      console.warn(`[Graph] 429 rate limited, waiting ${waitMs}ms`);
      await Bun.sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      throw new Error(`Graph ${res.status}: ${await res.text()}`);
    }

    return res;
  }

  throw new Error(`Graph request failed after ${maxRetries} retries`);
}

// -- Types --

export interface FolderChange {
  id: string;
  displayName: string;
  parentFolderId: string;
  childFolderCount: number;
  "@removed"?: { reason: string };
}

export interface FolderDeltaResult {
  changes: FolderChange[];
  deltaLink: string;
}

export interface MessageChange {
  id: string;
  internetMessageId?: string;
  subject?: string;
  from?: { emailAddress: { name: string; address: string } };
  receivedDateTime?: string;
  conversationId?: string;
  "@removed"?: { reason: string };
}

export interface MessageDeltaResult {
  changes: MessageChange[];
  deltaLink: string;
}

interface DeltaResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

// -- Folder Delta --

export async function foldersDelta(
  userId: string,
  previousDeltaLink: string | null
): Promise<FolderDeltaResult> {
  const changes: FolderChange[] = [];

  let url =
    previousDeltaLink ??
    `${GRAPH_BASE}/users/${userId}/mailFolders/delta?$select=id,displayName,parentFolderId,childFolderCount`;

  while (true) {
    const res = await graphFetch(url);
    const data = (await res.json()) as DeltaResponse<FolderChange>;

    changes.push(...data.value);

    if (data["@odata.nextLink"]) {
      url = data["@odata.nextLink"];
    } else if (data["@odata.deltaLink"]) {
      return { changes, deltaLink: data["@odata.deltaLink"] };
    } else {
      throw new Error("Delta response missing both nextLink and deltaLink");
    }
  }
}

// -- Message Delta --

const MSG_SELECT =
  "id,internetMessageId,subject,from,receivedDateTime,conversationId";

export async function messagesDelta(
  userId: string,
  folderId: string,
  previousDeltaLink: string | null
): Promise<MessageDeltaResult> {
  const changes: MessageChange[] = [];

  let url =
    previousDeltaLink ??
    `${GRAPH_BASE}/users/${userId}/mailFolders/${folderId}/messages/delta?$select=${MSG_SELECT}`;

  while (true) {
    const res = await graphFetch(url);
    const data = (await res.json()) as DeltaResponse<MessageChange>;

    changes.push(...data.value);

    if (data["@odata.nextLink"]) {
      url = data["@odata.nextLink"];
    } else if (data["@odata.deltaLink"]) {
      return { changes, deltaLink: data["@odata.deltaLink"] };
    } else {
      throw new Error("Delta response missing both nextLink and deltaLink");
    }
  }
}

// -- Folder Listing (for init) --

interface MailFolder {
  id: string;
  displayName: string;
  parentFolderId: string;
  childFolderCount: number;
}

export async function listChildFolders(
  userId: string,
  parentFolderId: string
): Promise<MailFolder[]> {
  const folders: MailFolder[] = [];
  let url = `${GRAPH_BASE}/users/${userId}/mailFolders/${parentFolderId}/childFolders?$select=id,displayName,parentFolderId,childFolderCount&$top=100`;

  while (url) {
    const res = await graphFetch(url);
    const data = (await res.json()) as {
      value: MailFolder[];
      "@odata.nextLink"?: string;
    };
    folders.push(...data.value);
    url = data["@odata.nextLink"] ?? "";
  }

  return folders;
}

export async function listTopLevelFolders(
  userId: string
): Promise<MailFolder[]> {
  const folders: MailFolder[] = [];
  let url = `${GRAPH_BASE}/users/${userId}/mailFolders?$select=id,displayName,parentFolderId,childFolderCount&$top=100`;

  while (url) {
    const res = await graphFetch(url);
    const data = (await res.json()) as {
      value: MailFolder[];
      "@odata.nextLink"?: string;
    };
    folders.push(...data.value);
    url = data["@odata.nextLink"] ?? "";
  }

  return folders;
}

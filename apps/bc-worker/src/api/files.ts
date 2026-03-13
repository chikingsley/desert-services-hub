/**
 * BuildingConnected file listing using auth cookies from the persistent
 * browser session.
 *
 * Resolves /goto/ or /opportunities/ URLs → opportunity ID → BC API file list.
 * Recursively traverses folders to return only downloadable FILE items.
 *
 * Uses native fetch() (NOT Playwright's context.request) because Playwright's
 * internal _parseSetCookieHeader crashes on relative redirect URLs from BC's
 * /goto/ endpoint.
 */
import { bcSession } from "../lib/browser";

const BC_BASE = "https://app.buildingconnected.com";
const REQUEST_TIMEOUT_MS = 30_000;
const RFP_ID_RE = /\/(?:rfps|opportunities)\/([a-f0-9]+)/i;
const MAX_FOLDER_DEPTH = 5;

export interface BCFile {
  _id: string;
  dateCreated?: string;
  dateModified?: string;
  downloadUrl: string;
  /** For files inside folders, prefixed with folder path (e.g. "Civil/C001.pdf") */
  name: string;
  size: number;
  type: string;
}

function extractOpportunityId(url: string): string | null {
  return url.match(RFP_ID_RE)?.[1] ?? null;
}

async function getAuthCookieHeader(): Promise<string> {
  const context = bcSession.getContext();
  if (!context) {
    throw new Error("No active browser context");
  }
  const cookies = await context.cookies(BC_BASE);
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

interface FilesSuccess {
  files: BCFile[];
  opportunityId: string;
  success: true;
}

interface FilesError {
  error: string;
  success: false;
}

interface RawBCItem {
  _id: string;
  dateCreated?: string;
  dateModified?: string;
  downloadUrl?: string;
  name: string;
  size: number;
  type: string;
}

/** Fetch items from a BC files endpoint (top-level or folder). */
async function fetchItems(
  url: string,
  cookieHeader: string
): Promise<RawBCItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      headers: { Cookie: cookieHeader },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.error(
      `[bc-worker-files] API returned HTTP ${response.status} for ${url}`
    );
    return [];
  }

  const data = (await response.json()) as { items?: RawBCItem[] };
  return data.items ?? [];
}

/**
 * Recursively resolve folder items into individual downloadable files.
 * Folders are expanded by calling /api/opportunities/{opId}/files/{folderId}.
 * File names are prefixed with their folder path for clarity.
 */
async function resolveItems(
  items: RawBCItem[],
  opportunityId: string,
  cookieHeader: string,
  pathPrefix: string,
  depth: number
): Promise<BCFile[]> {
  const files: BCFile[] = [];

  for (const item of items) {
    if (item.type === "FOLDER" && depth < MAX_FOLDER_DEPTH) {
      const folderPath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
      console.log(`[bc-worker-files] traversing folder: ${folderPath}`);

      const children = await fetchItems(
        `${BC_BASE}/api/opportunities/${opportunityId}/files/${item._id}`,
        cookieHeader
      );

      const resolved = await resolveItems(
        children,
        opportunityId,
        cookieHeader,
        folderPath,
        depth + 1
      );
      files.push(...resolved);
    } else if (item.downloadUrl) {
      const name = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
      files.push({
        _id: item._id,
        dateCreated: item.dateCreated,
        dateModified: item.dateModified,
        downloadUrl: item.downloadUrl,
        name,
        size: item.size,
        type: item.type,
      });
    }
  }

  return files;
}

async function listOpportunityFiles(
  gotoUrl: string
): Promise<FilesSuccess | FilesError> {
  const cookieHeader = await getAuthCookieHeader();

  // 1. Follow the /goto/ redirect to get the opportunity page URL.
  //    For direct /opportunities/ URLs, fetch resolves to the same URL.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let redirectResponse: globalThis.Response;
  try {
    redirectResponse = await fetch(gotoUrl, {
      headers: { Cookie: cookieHeader },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const finalUrl = redirectResponse.url;

  // 2. Extract opportunity/RFP ID from the resolved URL
  const opportunityId = extractOpportunityId(finalUrl);
  if (!opportunityId) {
    return {
      error: `Could not extract opportunity ID from: ${finalUrl}`,
      success: false as const,
    };
  }

  // 3. Fetch top-level items
  const topLevelItems = await fetchItems(
    `${BC_BASE}/api/opportunities/${opportunityId}/files`,
    cookieHeader
  );

  // 4. Recursively resolve folders into individual files
  const files = await resolveItems(
    topLevelItems,
    opportunityId,
    cookieHeader,
    "",
    0
  );

  console.log(
    `[bc-worker-files] resolved ${files.length} downloadable files from ${topLevelItems.length} top-level items`
  );

  return {
    files,
    opportunityId,
    success: true as const,
  };
}

export async function handleBuildingConnectedFiles(
  req: Request
): Promise<Response> {
  const status = bcSession.getStatus();
  if (!status.active) {
    return Response.json(
      { error: "No active browser session", success: false },
      { status: 503 }
    );
  }
  if (!status.isLoggedIn) {
    return Response.json(
      { error: "Not logged in", success: false },
      { status: 401 }
    );
  }

  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return Response.json(
      { error: "Invalid JSON body", success: false },
      { status: 400 }
    );
  }

  if (!body?.url || typeof body.url !== "string") {
    return Response.json(
      { error: "url is required", success: false },
      { status: 400 }
    );
  }

  try {
    const result = await listOpportunityFiles(body.url);
    if (!result.success) {
      return Response.json(result, { status: 422 });
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bc-worker-files] failed: ${message}`);
    return Response.json({ error: message, success: false }, { status: 500 });
  }
}

/**
 * Microsoft Graph API file utilities
 *
 * Download files from OneDrive/SharePoint sharing links.
 */
import { getGraphTokenCached } from "@lib/graph/token";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface OneDriveFileMetadata {
  id: string;
  name: string;
  size: number;
  downloadUrl: string;
}

/**
 * Get file metadata and download URL from a OneDrive/SharePoint sharing URL.
 *
 * The sharing URL is encoded to a token, then resolved via the Graph API
 * /shares endpoint. Returns a pre-authenticated download URL that can be
 * fetched directly (no additional auth needed).
 *
 * @see https://learn.microsoft.com/en-us/graph/api/shares-get
 */
export async function getOneDriveFileFromShareUrl(
  shareUrl: string
): Promise<OneDriveFileMetadata> {
  const token = await getGraphTokenCached();
  const encodedUrl = encodeSharingUrl(shareUrl);

  const res = await fetch(`${GRAPH_BASE}/shares/${encodedUrl}/driveItem`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Graph shares API error ${res.status}: ${text.slice(0, 200)}`
    );
  }

  const item = (await res.json()) as {
    id: string;
    name: string;
    size: number;
    "@microsoft.graph.downloadUrl"?: string;
  };

  const downloadUrl = item["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) {
    throw new Error(
      `No download URL for "${item.name}" — file may not be accessible`
    );
  }

  return {
    id: item.id,
    name: item.name,
    size: item.size,
    downloadUrl,
  };
}

/**
 * Encode a sharing URL for the Graph API /shares endpoint.
 * Format: u!<base64url(url)>
 */
function encodeSharingUrl(url: string): string {
  const base64 = Buffer.from(url)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\//g, "_")
    .replace(/\+/g, "-");
  return `u!${base64}`;
}

/**
 * Shared Graph API helpers — pagination, response parsers, buffer conversion.
 *
 * These are internal utilities used by graph-operations.ts and client.ts.
 * Not intended for direct external use.
 */

import type { Client, PageCollection } from "@microsoft/microsoft-graph-client";
import { PageIterator } from "@microsoft/microsoft-graph-client";
import type {
  SharePointFile,
  SharePointFolder,
  SharePointItem,
  SharePointSite,
} from "@sharepoint/types";

// =============================================================================
// Pagination
// =============================================================================

/**
 * Collect all pages from a paginated Graph API response.
 * Uses the SDK's PageIterator to follow @odata.nextLink automatically.
 */
export async function collectPages<T>(
  client: Client,
  response: PageCollection,
  transform: (item: Record<string, unknown>) => T
): Promise<T[]> {
  const items: T[] = [];

  const iterator = new PageIterator(
    client,
    response,
    (data: Record<string, unknown>) => {
      items.push(transform(data));
      return true;
    }
  );

  await iterator.iterate();
  return items;
}

// =============================================================================
// Response parsers
// =============================================================================

export function parseSite(site: Record<string, unknown>): SharePointSite {
  return {
    description: site.description as string | undefined,
    displayName: (site.displayName as string) ?? (site.name as string),
    id: site.id as string,
    name: site.name as string,
    webUrl: site.webUrl as string,
  };
}

export function parseItem(item: Record<string, unknown>): SharePointItem {
  return {
    createdDateTime: item.createdDateTime as string,
    file: item.file as SharePointFile | undefined,
    folder: item.folder as SharePointFolder | undefined,
    id: item.id as string,
    lastModifiedDateTime: item.lastModifiedDateTime as string,
    name: item.name as string,
    size: item.size as number | undefined,
    webUrl: item.webUrl as string,
  };
}

// =============================================================================
// Buffer conversion
// =============================================================================

/**
 * Convert a Graph API response (Buffer, ArrayBuffer, or ReadableStream) to Buffer.
 */
export function responseToBuffer(response: unknown): Buffer | Promise<Buffer> {
  if (Buffer.isBuffer(response)) {
    return response;
  }

  if (response instanceof ArrayBuffer) {
    return Buffer.from(response);
  }

  if (isReadableStream(response)) {
    return readStreamToBuffer(response);
  }

  return Buffer.from(response as ArrayBuffer);
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return value !== null && typeof value === "object" && "getReader" in value;
}

async function readStreamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  let result = await reader.read();
  while (result.done === false) {
    if (result.value) {
      chunks.push(result.value);
    }
    result = await reader.read();
  }

  return Buffer.concat(chunks);
}

// =============================================================================
// Path helpers
// =============================================================================

export function isRootPath(path: string): boolean {
  return path === "/" || path === "";
}

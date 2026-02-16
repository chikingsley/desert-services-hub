import { getAppClient } from "@email/commands/config";

interface FolderMeta {
  id: string;
  displayName: string;
  parentFolderId: string | null;
}

export const WELL_KNOWN_MOVE_DESTS = new Set([
  "inbox",
  "drafts",
  "sentitems",
  "deleteditems",
  "archive",
  "junkemail",
]);

export function createFolderLabeler(options: {
  userId: string;
  paths: boolean;
  maxDepth: number;
}): {
  label: (folderId: string) => Promise<string>;
} {
  const client = getAppClient();
  const metaCache = new Map<string, FolderMeta | null>();
  const inFlight = new Map<string, Promise<FolderMeta | null>>();
  const labelCache = new Map<string, string>();

  const getMeta = async (folderId: string): Promise<FolderMeta | null> => {
    if (metaCache.has(folderId)) {
      return metaCache.get(folderId) ?? null;
    }
    const existing = inFlight.get(folderId);
    if (existing) {
      return await existing;
    }

    const p = client
      .getFolderById(folderId, options.userId)
      .then((meta) => {
        metaCache.set(folderId, meta);
        return meta;
      })
      .finally(() => {
        inFlight.delete(folderId);
      });

    inFlight.set(folderId, p);
    return await p;
  };

  const label = async (folderId: string): Promise<string> => {
    const cached = labelCache.get(folderId);
    if (cached) {
      return cached;
    }

    const meta = await getMeta(folderId);
    if (!meta) {
      labelCache.set(folderId, folderId);
      return folderId;
    }

    if (!options.paths) {
      labelCache.set(folderId, meta.displayName);
      return meta.displayName;
    }

    const parts: string[] = [];
    const seen = new Set<string>();
    let current: FolderMeta | null = meta;
    let depth = 0;

    while (current && depth < options.maxDepth) {
      parts.unshift(current.displayName);
      if (!current.parentFolderId) {
        break;
      }
      if (seen.has(current.parentFolderId)) {
        break;
      }
      seen.add(current.parentFolderId);
      current = await getMeta(current.parentFolderId);
      depth++;
    }

    const out = parts.join("/");
    labelCache.set(folderId, out);
    return out;
  };

  return { label };
}

export function formatDate(d: Date): string {
  // ISO date only is easiest to scan in terminals
  return d.toISOString().slice(0, 10);
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) {
          return;
        }
        results[index] = await fn(items[index], index);
      }
    })()
  );

  await Promise.all(workers);
  return results;
}

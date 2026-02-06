/**
 * Mail folder listing command.
 */
import { parseArgs } from "node:util";
import type { MailFolderWithChildren } from "@email/client";
import { DEFAULT_USER, getAppClient } from "@email/commands/config";
import type { CommandHandler } from "@email/commands/types";

interface FlatFolder {
  id: string;
  displayName: string;
  parentFolderId: string | null;
  depth: number;
  path: string;
}

function flatten(
  nodes: MailFolderWithChildren[],
  parentPath: string,
  depth: number
): FlatFolder[] {
  const out: FlatFolder[] = [];
  for (const n of nodes) {
    const currentPath = parentPath
      ? `${parentPath}/${n.displayName}`
      : n.displayName;
    out.push({
      id: n.id,
      displayName: n.displayName,
      parentFolderId: n.parentFolderId ?? null,
      depth,
      path: currentPath,
    });
    if (n.children && n.children.length > 0) {
      out.push(...flatten(n.children, currentPath, depth + 1));
    }
  }
  return out;
}

async function foldersCommand(options: {
  userId: string;
  recursive: boolean;
  query?: string;
  maxDepth: number;
  paths: boolean;
}) {
  const client = getAppClient();
  const { userId, recursive, query, maxDepth, paths } = options;
  const normQuery = query?.trim().toLowerCase();

  if (!recursive) {
    const folders = await client.listFolders(userId);
    console.log(`Mail folders for ${userId}:\n`);
    for (const folder of folders) {
      if (
        normQuery &&
        !folder.displayName.toLowerCase().includes(normQuery) &&
        !folder.id.toLowerCase().includes(normQuery)
      ) {
        continue;
      }
      console.log(`- ${folder.displayName}`);
      console.log(`  ID: ${folder.id}\n`);
    }
    return;
  }

  const tree = await client.listFoldersRecursive(userId, maxDepth);
  const flat = flatten(tree, "", 0);

  const filtered = normQuery
    ? flat.filter(
        (f) =>
          f.displayName.toLowerCase().includes(normQuery) ||
          f.id.toLowerCase().includes(normQuery) ||
          f.path.toLowerCase().includes(normQuery)
      )
    : flat;

  console.log(
    `Mail folders for ${userId} (recursive, maxDepth=${maxDepth}):\n`
  );
  for (const folder of filtered) {
    if (paths) {
      console.log(`- ${folder.path}`);
    } else {
      console.log(`${"  ".repeat(folder.depth)}- ${folder.displayName}`);
    }
    console.log(`  ID: ${folder.id}\n`);
  }
}

export const foldersHandlers: Record<string, CommandHandler> = {
  folders: async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        recursive: { type: "boolean", short: "r", default: false },
        query: { type: "string", short: "q" },
        "max-depth": { type: "string", default: "10" },
        paths: { type: "boolean", default: false },
      },
    });
    await foldersCommand({
      userId: values.user as string,
      recursive: values.recursive ?? false,
      query: values.query,
      maxDepth: Number.parseInt(values["max-depth"] as string, 10),
      paths: values.paths ?? false,
    });
  },
};

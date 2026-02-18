import { parseArgs } from "node:util";
import type { CommandHandler } from "@email/commands/types";
import { hydrateProjectFolderCommand } from "./hydrate-project";
import { hydrateTrackedProjectsCommand } from "./hydrate-tracked";
import { moveMessageCommand, moveThreadCommand } from "./move";
import {
  createProjectFolderCommand,
  listProjectFoldersCommand,
  mkdirProjectFolderCommand,
} from "./project-folders";

export const organizeHandlers: Record<string, CommandHandler> = {
  move: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u" },
        dest: { type: "string", short: "d" },
        apply: { type: "boolean", default: false },
        "skip-db-update": { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const messageId = positionals[0];
    const destinationId = values.dest as string | undefined;
    if (!(messageId && destinationId && values.user)) {
      console.error(
        "Usage: move <messageId> --dest <folderId|wellKnown> --user <mailbox> [--apply]"
      );
      process.exit(1);
    }

    await moveMessageCommand({
      messageId,
      destinationId,
      userId: values.user as string,
      apply: values.apply ?? false,
      skipDbUpdate: values["skip-db-update"] ?? false,
    });
  },

  "move-thread": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u" },
        dest: { type: "string", short: "d" },
        apply: { type: "boolean", default: false },
        limit: { type: "string", short: "l", default: "0" },
        "max-depth": { type: "string", default: "10" },
        paths: { type: "boolean", default: true },
        "skip-db-update": { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const messageId = positionals[0];
    const destinationId = values.dest as string | undefined;
    if (!(messageId && destinationId && values.user)) {
      console.error(
        "Usage: move-thread <messageId> --dest <folderId> --user <mailbox> [--apply] [--limit N]"
      );
      process.exit(1);
    }

    await moveThreadCommand({
      messageId,
      destinationId,
      userId: values.user as string,
      apply: values.apply ?? false,
      limit: Number.parseInt(values.limit as string, 10) || 0,
      maxDepth: Number.parseInt(values["max-depth"] as string, 10) || 10,
      showPaths: values.paths ?? true,
      skipDbUpdate: values["skip-db-update"] ?? false,
    });
  },

  "project-folder-create": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u" },
        apply: { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const projectArg = positionals[0];
    if (!(projectArg && values.user)) {
      console.error(
        "Usage: project-folder-create <projectId|name|outlookFolderName> --user <mailbox> [--apply]"
      );
      process.exit(1);
    }

    await createProjectFolderCommand({
      projectArg,
      userId: values.user as string,
      apply: values.apply ?? false,
    });
  },

  "project-folder-mkdir": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u" },
        apply: { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const folderName = positionals[0];
    if (!(folderName && values.user)) {
      console.error(
        "Usage: project-folder-mkdir <folderDisplayName> --user <mailbox> [--apply]"
      );
      process.exit(1);
    }

    await mkdirProjectFolderCommand({
      folderName,
      userId: values.user as string,
      apply: values.apply ?? false,
    });
  },

  "project-folders": async () => {
    await listProjectFoldersCommand();
  },

  "project-hydrate": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u" },
        apply: { type: "boolean", default: false },
        limit: { type: "string", short: "l", default: "0" },
        threads: { type: "string", short: "t", default: "200" },
        "include-mixed": { type: "boolean", default: false },
        paths: { type: "boolean", default: true },
        "max-depth": { type: "string", default: "10" },
        quiet: { type: "boolean", default: false },
        concurrency: { type: "string", default: "1" },
        "skip-db-update": { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const projectArg = positionals[0];
    if (!(projectArg && values.user)) {
      console.error(
        "Usage: project-hydrate <projectId|name|outlookFolderName> --user <mailbox> [--apply] [--limit N] [--threads N]"
      );
      process.exit(1);
    }

    await hydrateProjectFolderCommand({
      projectArg,
      userId: values.user as string,
      apply: values.apply ?? false,
      limit: Number.parseInt(values.limit as string, 10) || 0,
      maxThreads: Number.parseInt(values.threads as string, 10) || 200,
      includeMixed: values["include-mixed"] ?? false,
      showPaths: values.paths ?? true,
      maxDepth: Number.parseInt(values["max-depth"] as string, 10) || 10,
      quiet: values.quiet ?? false,
      concurrency: Number.parseInt(values.concurrency as string, 10) || 1,
      skipDbUpdate: values["skip-db-update"] ?? false,
    });
  },

  "project-hydrate-tracked": async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u" },
        apply: { type: "boolean", default: false },
        limit: { type: "string", short: "l", default: "0" },
        threads: { type: "string", short: "t", default: "50" },
        "include-mixed": { type: "boolean", default: false },
        "max-projects": { type: "string", default: "0" },
        concurrency: { type: "string", default: "4" },
        "skip-db-update": { type: "boolean", default: false },
      },
    });

    if (!values.user) {
      console.error(
        "Usage: project-hydrate-tracked --user <mailbox> [--apply] [--limit N] [--threads N]"
      );
      process.exit(1);
    }

    await hydrateTrackedProjectsCommand({
      userId: values.user as string,
      apply: values.apply ?? false,
      limit: Number.parseInt(values.limit as string, 10) || 0,
      maxThreads: Number.parseInt(values.threads as string, 10) || 50,
      includeMixed: values["include-mixed"] ?? false,
      maxProjects: Number.parseInt(values["max-projects"] as string, 10) || 0,
      concurrency: Number.parseInt(values.concurrency as string, 10) || 4,
      skipDbUpdate: values["skip-db-update"] ?? false,
    });
  },
};

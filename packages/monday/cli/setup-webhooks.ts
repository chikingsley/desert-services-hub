#!/usr/bin/env bun

/**
 * Register Monday.com webhooks for selected boards.
 *
 * Usage:
 *   bun packages/monday/cli/setup-webhooks.ts --url=https://your-base-url
 *   bun packages/monday/cli/setup-webhooks.ts --url=https://your-base-url --boards=ESTIMATING,LEADS,PROJECTS
 *   bun packages/monday/cli/setup-webhooks.ts --list --boards=ESTIMATING,LEADS
 *   bun packages/monday/cli/setup-webhooks.ts --delete=WEBHOOK_ID
 */
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
} from "@monday/client/webhooks";
import type { WebhookEventType } from "@monday/types/events";
import { BOARD_IDS } from "@monday/types/schema";

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith("--url="));
const listFlag = args.includes("--list");
const deleteArg = args.find((a) => a.startsWith("--delete="));
const boardsArg = args.find((a) => a.startsWith("--boards="));

const BOARD_KEYS = Object.keys(BOARD_IDS) as Array<keyof typeof BOARD_IDS>;

const DEFAULT_BOARD_KEYS: Array<keyof typeof BOARD_IDS> = ["ESTIMATING"];

const WEBHOOK_EVENTS: WebhookEventType[] = [
  "change_status_column_value",
  "create_item",
  "change_column_value",
  "change_name",
];

function parseBoardIds(): string[] {
  if (!boardsArg) {
    return DEFAULT_BOARD_KEYS.map((k) => BOARD_IDS[k]);
  }

  const requested = boardsArg
    .split("=")[1]
    ?.split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);

  if (!requested?.length) {
    throw new Error("--boards is empty");
  }

  const ids: string[] = [];
  for (const key of requested) {
    if (!BOARD_KEYS.includes(key as keyof typeof BOARD_IDS)) {
      throw new Error(
        `Unknown board key "${key}". Valid values: ${BOARD_KEYS.join(", ")}`
      );
    }
    ids.push(BOARD_IDS[key as keyof typeof BOARD_IDS]);
  }
  return ids;
}

async function listBoards(boardIds: string[]): Promise<void> {
  for (const boardId of boardIds) {
    const webhooks = await listWebhooks(boardId);
    console.log(`\nBoard ${boardId}: ${webhooks.length} webhook(s)`);
    for (const wh of webhooks) {
      console.log(
        `  ID: ${wh.id}  Event: ${wh.event}  Config: ${wh.config ?? "(none)"}`
      );
    }
  }
}

async function setup(baseUrl: string, boardIds: string[]): Promise<void> {
  const webhookUrl = `${baseUrl}/functions/v1/monday-webhook`;

  console.log(`Target URL: ${webhookUrl}`);
  console.log(`Boards: ${boardIds.join(", ")}`);
  const nonEstimatingBoards = boardIds.filter(
    (boardId) => boardId !== BOARD_IDS.ESTIMATING
  );
  if (nonEstimatingBoards.length > 0) {
    console.warn(
      `[warn] Edge default allows only ESTIMATING. Set MONDAY_WEBHOOK_BOARD_IDS to include: ${nonEstimatingBoards.join(", ")}`
    );
  }

  for (const boardId of boardIds) {
    console.log(`\nRegistering webhooks on board ${boardId}`);
    const existing = await listWebhooks(boardId);
    const existingEvents = new Set(existing.map((w) => w.event));

    for (const event of WEBHOOK_EVENTS) {
      if (existingEvents.has(event)) {
        console.log(`  [skip] ${event} — already registered`);
        continue;
      }

      const wh = await createWebhook({
        boardId,
        url: webhookUrl,
        event,
      });

      console.log(`  [created] ${event} → webhook ID ${wh.id}`);
    }
  }

  console.log("\nDone.");
}

async function remove(webhookId: string): Promise<void> {
  const wh = await deleteWebhook(webhookId);
  console.log(`Deleted webhook ${wh.id} from board ${wh.board_id}`);
}

const boardIds = parseBoardIds();

if (listFlag) {
  await listBoards(boardIds);
} else if (deleteArg) {
  const id = deleteArg.split("=")[1];
  if (!id) {
    console.error("Usage: --delete=WEBHOOK_ID");
    process.exit(1);
  }
  await remove(id);
} else if (urlArg) {
  const url = urlArg.split("=").slice(1).join("=");
  if (!url) {
    console.error("Usage: --url=https://your-base-url");
    process.exit(1);
  }
  await setup(url, boardIds);
} else {
  console.log("Usage:");
  console.log(
    "  --url=https://...   Register webhooks pointing at edge function"
  );
  console.log(
    "  --boards=ESTIMATING,LEADS,PROJECTS  Optional board keys (default: ESTIMATING)"
  );
  console.log(
    "  --list              List existing webhooks on selected boards"
  );
  console.log("  --delete=ID         Delete a webhook by ID");
}

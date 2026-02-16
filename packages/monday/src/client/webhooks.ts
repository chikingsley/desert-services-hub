/**
 * Webhook operations.
 */
import type { MondayWebhook, WebhookEventType } from "@monday/types";
import { query } from "./query";

/**
 * List webhooks for a board.
 */
export async function listWebhooks(boardId: string): Promise<MondayWebhook[]> {
  const result = await query<{
    webhooks: MondayWebhook[];
  }>(`
    query {
      webhooks(board_id: ${boardId}) {
        id
        event
        board_id
        config
      }
    }
  `);

  return result.webhooks ?? [];
}

/**
 * Create a webhook subscription for a board event.
 */
export async function createWebhook(options: {
  boardId: string;
  url: string;
  event: WebhookEventType;
  config?: string;
}): Promise<MondayWebhook> {
  const configPart = options.config
    ? `, config: ${JSON.stringify(options.config)}`
    : "";

  const result = await query<{
    create_webhook: MondayWebhook;
  }>(`
    mutation {
      create_webhook(
        board_id: ${options.boardId}
        url: "${options.url}"
        event: ${options.event}
        ${configPart}
      ) {
        id
        board_id
        event
        config
      }
    }
  `);

  return result.create_webhook;
}

/**
 * Delete a webhook by ID.
 */
export async function deleteWebhook(webhookId: string): Promise<MondayWebhook> {
  const result = await query<{
    delete_webhook: MondayWebhook;
  }>(`
    mutation {
      delete_webhook(id: ${webhookId}) {
        id
        board_id
      }
    }
  `);

  return result.delete_webhook;
}

/**
 * Monday webhook and event payload types.
 */
import type { MondayBoard } from "./schema";

export interface MondayWebhook {
  id: string;
  board_id: string;
  event: WebhookEventType;
  config: string | null;
}

export type WebhookEventType =
  | "change_column_value"
  | "change_status_column_value"
  | "change_subitem_column_value"
  | "change_specific_column_value"
  | "change_name"
  | "create_item"
  | "item_archived"
  | "item_deleted"
  | "item_moved_to_any_group"
  | "item_moved_to_specific_group"
  | "item_restored"
  | "create_subitem"
  | "change_subitem_name"
  | "move_subitem"
  | "subitem_archived"
  | "subitem_deleted"
  | "create_column"
  | "create_update"
  | "edit_update"
  | "delete_update"
  | "create_subitem_update";

/**
 * Payload sent by Monday when a status column changes.
 */
export interface StatusChangeEvent {
  userId: number;
  boardId: number;
  groupId: string;
  pulseId: number;
  pulseName: string;
  columnId: string;
  columnType: string;
  columnTitle: string;
  value: {
    label: {
      index: number;
      text: string;
      style: { color: string; border: string; var_name: string };
    };
    post_id: string | null;
  };
  previousValue: {
    label: {
      index: number;
      text: string;
      style: { color: string; border: string; var_name: string };
    };
    post_id: string | null;
  } | null;
  changedAt: number;
  type: string;
  triggerTime: string;
  subscriptionId: number;
}

/**
 * Payload sent by Monday when a new item is created.
 */
export interface CreateItemEvent {
  userId: number;
  boardId: number;
  pulseId: number;
  pulseName: string;
  groupId: string;
  groupName: string;
  groupColor: string;
  isTopGroup: boolean;
  columnValues: Record<string, unknown>;
  type: string;
  triggerTime: string;
  subscriptionId: number;
}

/**
 * Payload sent by Monday when any column value changes.
 */
export interface ColumnChangeEvent {
  userId: number;
  boardId: number;
  groupId: string;
  pulseId: number;
  pulseName: string;
  columnId: string;
  columnType: string;
  columnTitle: string;
  value: unknown;
  previousValue: unknown;
  changedAt: number;
  type: string;
  triggerTime: string;
  subscriptionId: number;
  board?: MondayBoard;
}

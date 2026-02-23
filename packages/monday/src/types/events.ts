/**
 * Monday webhook and event payload types.
 */
import type { MondayBoard } from "./schema";

export interface MondayWebhook {
  board_id: string;
  config: string | null;
  event: WebhookEventType;
  id: string;
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
  boardId: number;
  changedAt: number;
  columnId: string;
  columnTitle: string;
  columnType: string;
  groupId: string;
  previousValue: {
    label: {
      index: number;
      text: string;
      style: { color: string; border: string; var_name: string };
    };
    post_id: string | null;
  } | null;
  pulseId: number;
  pulseName: string;
  subscriptionId: number;
  triggerTime: string;
  type: string;
  userId: number;
  value: {
    label: {
      index: number;
      text: string;
      style: { color: string; border: string; var_name: string };
    };
    post_id: string | null;
  };
}

/**
 * Payload sent by Monday when a new item is created.
 */
export interface CreateItemEvent {
  boardId: number;
  columnValues: Record<string, unknown>;
  groupColor: string;
  groupId: string;
  groupName: string;
  isTopGroup: boolean;
  pulseId: number;
  pulseName: string;
  subscriptionId: number;
  triggerTime: string;
  type: string;
  userId: number;
}

/**
 * Payload sent by Monday when any column value changes.
 */
export interface ColumnChangeEvent {
  board?: MondayBoard;
  boardId: number;
  changedAt: number;
  columnId: string;
  columnTitle: string;
  columnType: string;
  groupId: string;
  previousValue: unknown;
  pulseId: number;
  pulseName: string;
  subscriptionId: number;
  triggerTime: string;
  type: string;
  userId: number;
  value: unknown;
}

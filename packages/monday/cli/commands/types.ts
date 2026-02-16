export type CommandHandler = (args: string[]) => Promise<void> | void;

export interface CommandItem {
  id: string;
  name: string;
  groupTitle?: string;
  columns?: Record<string, string | null>;
  columnValues?: {
    id: string;
    type: string;
    text: string | null;
    value: string | null;
    linked_item_ids?: string[];
    displayValue?: string;
  }[];
}

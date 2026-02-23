import { BOARD_IDS } from "@monday/types/schema";
import type { CommandItem } from "./types";

const boardIdByAlias = Object.fromEntries(
  Object.entries(BOARD_IDS).map(([k, v]) => [k.toLowerCase(), v])
);

export function resolveBoardId(nameOrId: string): string {
  return boardIdByAlias[nameOrId.toLowerCase()] ?? nameOrId;
}

export function getBoardKeys(): string[] {
  return Object.keys(boardIdByAlias);
}

export function formatItem(item: CommandItem): void {
  console.log(`\n${item.name} (${item.id})`);
  if (item.groupTitle) {
    console.log(`  Group: ${item.groupTitle}`);
  }

  if (item.columnValues) {
    for (const col of item.columnValues) {
      const display = col.displayValue || col.text || col.value;
      if (!display) {
        continue;
      }
      const linked = col.linked_item_ids?.length
        ? ` [linked: ${col.linked_item_ids.join(", ")}]`
        : "";
      console.log(`  ${col.id} (${col.type}): ${display}${linked}`);
    }
    return;
  }

  if (!item.columns) {
    return;
  }

  for (const [colId, val] of Object.entries(item.columns)) {
    if (!val) {
      continue;
    }
    console.log(`  ${colId}: ${val}`);
  }
}

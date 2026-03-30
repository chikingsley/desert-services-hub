/**
 * Find duplicate items on boards (e.g. duplicate contractor account names).
 */
import { getItems } from "@monday/client/items";
import { BOARD_IDS } from "@monday/types/schema";
import { parseLongFlags } from "./args";
import type { CommandHandler } from "./types";

function normalizeAccountName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replaceAll(/\s+/g, " ");
}

export const duplicatesHandlers: Record<string, CommandHandler> = {
  "contractors-duplicates": async (args) => {
    const flags = parseLongFlags(args.slice(1));
    const jsonOut = flags.json === true;

    const items = await getItems(BOARD_IDS.CONTRACTORS);
    const byNorm = new Map<string, typeof items>();

    for (const item of items) {
      const key = normalizeAccountName(item.name);
      if (!key) {
        continue;
      }
      const list = byNorm.get(key);
      if (list) {
        list.push(item);
      } else {
        byNorm.set(key, [item]);
      }
    }

    const dupes = [...byNorm.entries()]
      .filter(([, list]) => list.length > 1)
      .sort((a, b) => a[0].localeCompare(b[0]));

    if (jsonOut) {
      console.log(
        JSON.stringify(
          dupes.map(([key, list]) => ({
            normalizedName: key,
            count: list.length,
            items: list.map((i) => ({
              id: i.id,
              name: i.name,
              group: i.groupTitle,
              url: i.url,
            })),
          })),
          null,
          2
        )
      );
      return;
    }

    if (dupes.length === 0) {
      console.log(
        `No duplicate contractor names found (${items.length} accounts scanned).`
      );
      return;
    }

    console.log(
      `${dupes.length} duplicate name group(s) (${items.length} accounts scanned). Merge or archive extras in Monday — CLI does not delete items.\n`
    );
    for (const [key, list] of dupes) {
      console.log(`\n"${key}" (${list.length} rows)`);
      for (const item of list) {
        console.log(`  ${item.id}\t${item.name}\t${item.groupTitle}\n  ${item.url}`);
      }
    }
  },
};

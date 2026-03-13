import { AUDIT_CHAINS } from "../audit/chains";
import { getBoardKeys } from "./shared";

export function getItemIdArg(args: string[]): string {
  const itemId = args[1];
  if (!itemId) {
    throw new Error("Usage: get <itemId>");
  }
  return itemId;
}

export function getBoardNameArg(args: string[]): string {
  const boardName = args[1];
  if (!boardName) {
    throw new Error("Usage: <command> <board>");
  }
  return boardName;
}

export function getJsonArg(args: string[]): string {
  const json = args[3];
  if (!json) {
    throw new Error("Usage: update <board> <itemId> '<json>'");
  }
  return json;
}

export function showHelp(): void {
  console.log(`
Desert Monday CLI

Usage: bun packages/monday/cli/cli.ts <command> [options]

Commands:
  get <itemId>                    Get item by ID (rich: linked items, mirrors)
  search <board> <query>          Search items by name on a board
  search-col <board> <colId> <value>  Search by column value
  contract-check <query>          Resolve project + estimate and check Monday Contract Status (Executed or not)
  boards                          List known boards
  columns <board>                 List columns for a board
  groups <board>                  List groups for a board
  update <board> <itemId> <json>  Update item column values
  audit-rel [all|chain-key]       Resolution audit (direct/relation_fallback/display_fallback/unresolved)
                                  Add --active-only to skip known non-production groups where configured
  backfill-rel [scope]            Backfill direct Monday relations from resolvable relation chains
                                  Add --dry-run, --limit N, --active-only

Boards: ${getBoardKeys().join(", ")}

Audit chain keys:
  ${AUDIT_CHAINS.map((c) => c.key).join("\n  ")}

Examples:
  bun packages/monday/cli/cli.ts get 9758584422
  bun packages/monday/cli/cli.ts search leads "Revolve"
  bun packages/monday/cli/cli.ts columns leads
  bun packages/monday/cli/cli.ts groups estimating
  bun packages/monday/cli/cli.ts contract-check "THE VERGE"
  bun packages/monday/cli/cli.ts update leads 12345 '{"color_mm068kjz":{"label":"Lost"}}'
  bun packages/monday/cli/cli.ts audit-rel all
  bun packages/monday/cli/cli.ts audit-rel estimating-account --active-only
  bun packages/monday/cli/cli.ts backfill-rel estimating-account --dry-run --active-only --limit 5
`);
}

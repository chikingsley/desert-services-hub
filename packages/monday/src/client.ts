/**
 * Monday.com API Client
 *
 * Core entrypoint for API operations and data shapes.
 */

export { getItemAssets } from "./client/assets";
export { getBoard, getBoardColumns } from "./client/boards";
export type { ScoredItem } from "./client/fuzzy";
export {
  calculateSimilarity,
  findBestMatches,
} from "./client/fuzzy";
export { getItem, getItemNames, getItems } from "./client/items";
export { query } from "./client/query";
export type { MondayColumnValue, MondayItemRich } from "./client/rich";
export { getItemRich, getItemsRich } from "./client/rich";
export {
  createItem,
  renameItem,
  searchByColumnValue,
  searchItems,
  updateItem,
} from "./client/search";
export { createWebhook, deleteWebhook, listWebhooks } from "./client/webhooks";

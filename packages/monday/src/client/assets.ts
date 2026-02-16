/**
 * Asset read operations.
 */
import type { MondayAsset } from "@monday/types";
import { query } from "./query";

/**
 * Get all file assets for an item.
 */
export async function getItemAssets(itemId: string): Promise<MondayAsset[]> {
  const result = await query<{
    items: { assets: MondayAsset[] }[];
  }>(`
    query {
      items(ids: [${itemId}]) {
        assets(assets_source: all) {
          id
          name
          url
          public_url
          file_extension
          file_size
          created_at
        }
      }
    }
  `);

  return result.items[0]?.assets ?? [];
}

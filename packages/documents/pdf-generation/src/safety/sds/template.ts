import type { SdsListDocument } from "@documents/pdf/sds/types";
import { DEFAULT_SDS_ENTRIES } from "./default-entries";

export function templateDoc(): SdsListDocument {
  return {
    entries: DEFAULT_SDS_ENTRIES,
    revision: "0",
    subtitle: "Chemical Inventory List",
    title: "Safety Data Sheets",
    updated: "April 2025",
  };
}

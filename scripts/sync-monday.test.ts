import { describe, expect, it } from "bun:test";

// We can't easily import from sync-monday.ts because it executes main() on import
// So we'll test the logic patterns by reimplementing the helper or factor it out.
// For now, I'll test the patterns defined in the script.

const GARBAGE_NAME_PATTERNS = ["COPY", "DUPLICATE", "TEMPLATE"];
const EXCLUDED_GROUPS = ["HISTORIC", "ARCHIVE", "COMPLETED", "HISTORIC DATA"];

function isGarbage(name: string, groupTitle: string): boolean {
  if (!name || name.trim().length === 0) {
    return true;
  }

  const upperName = name.toUpperCase();
  if (GARBAGE_NAME_PATTERNS.some((p) => upperName.includes(p))) {
    return true;
  }

  const upperGroup = groupTitle.toUpperCase();
  if (EXCLUDED_GROUPS.some((p) => upperGroup.includes(p))) {
    return true;
  }

  return false;
}

describe("Monday Sync Cleansing Logic", () => {
  it("filters out empty names", () => {
    expect(isGarbage("", "Active")).toBe(true);
    expect(isGarbage("  ", "Active")).toBe(true);
  });

  it("filters out items containing garbage keywords", () => {
    expect(isGarbage("Project Copy", "Active")).toBe(true);
    expect(isGarbage("Duplicate of Site A", "Active")).toBe(true);
    expect(isGarbage("Template - Base", "Active")).toBe(true);
  });

  it("filters out items in historic or archive groups", () => {
    expect(isGarbage("Project A", "Historic Data")).toBe(true);
    expect(isGarbage("Project B", "Archive 2024")).toBe(true);
    expect(isGarbage("Project C", "Completed Bids")).toBe(true);
  });

  it("keeps active valid items", () => {
    expect(isGarbage("New Fence Install", "Incoming")).toBe(false);
    expect(isGarbage("Phase 2 Scottsdale", "Open Bids")).toBe(false);
  });
});

describe("Selective Indexing Logic", () => {
  it("identifies high-value columns for search", () => {
    // Check used in sync-monday.ts for high-value columns
    const isHighValue = (id: string) =>
      id.includes("text") ||
      id.includes("numbers") ||
      id.includes("deal_") ||
      id.includes("estimate");

    expect(isHighValue("text_mkseybgg")).toBe(true);
    expect(isHighValue("deal_account")).toBe(true);
    expect(isHighValue("numbers_1")).toBe(true);
    expect(isHighValue("estimate_file")).toBe(true);

    expect(isHighValue("color_mktmdrgk")).toBe(false);
    expect(isHighValue("board_relation_mktgzr87")).toBe(false);
    expect(isHighValue("date_mksf70mc")).toBe(false);
  });
});

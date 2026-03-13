import { describe, expect, test } from "bun:test";
import { manageItems } from "@/apps/web/frontend/components/app-sidebar";

describe("app sidebar manage items", () => {
  test("keeps sender review as the active email triage lane", () => {
    const titles = manageItems.map((item) => item.title);

    expect(titles).toContain("Sender Review");
    expect(titles).not.toContain("Email Relevance");
  });
});

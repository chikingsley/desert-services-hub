/**
 * Notion Service Tests
 *
 * Run: bun test services/notion/notion.test.ts
 */
import { describe, expect, it } from "bun:test";
import {
  checkbox,
  date,
  email,
  multiSelect,
  number,
  phone,
  relation,
  richText,
  select,
  title,
  url,
} from "./client";

describe("notion service", () => {
  describe("property helpers", () => {
    it("builds title property", () => {
      const prop = title("Hello World");
      expect(prop).toEqual({
        title: [{ text: { content: "Hello World" } }],
      });
    });

    it("builds rich text property", () => {
      const prop = richText("Some text");
      expect(prop).toEqual({
        rich_text: [{ text: { content: "Some text" } }],
      });
    });

    it("builds URL property", () => {
      const prop = url("https://example.com");
      expect(prop).toEqual({ url: "https://example.com" });
    });

    it("builds email property", () => {
      const prop = email("test@example.com");
      expect(prop).toEqual({ email: "test@example.com" });
    });

    it("builds phone property", () => {
      const prop = phone("555-1234");
      expect(prop).toEqual({ phone_number: "555-1234" });
    });

    it("builds relation property", () => {
      const prop = relation(["page-1", "page-2"]);
      expect(prop).toEqual({
        relation: [{ id: "page-1" }, { id: "page-2" }],
      });
    });

    it("builds multi-select property", () => {
      const prop = multiSelect(["Tag1", "Tag2"]);
      expect(prop).toEqual({
        multi_select: [{ name: "Tag1" }, { name: "Tag2" }],
      });
    });

    it("builds select property", () => {
      const prop = select("Option A");
      expect(prop).toEqual({ select: { name: "Option A" } });
    });

    it("builds number property", () => {
      const prop = number(42);
      expect(prop).toEqual({ number: 42 });
    });

    it("builds checkbox property", () => {
      const propTrue = checkbox(true);
      const propFalse = checkbox(false);
      expect(propTrue).toEqual({ checkbox: true });
      expect(propFalse).toEqual({ checkbox: false });
    });

    it("builds date property", () => {
      const propStart = date("2024-01-01");
      expect(propStart).toEqual({ date: { start: "2024-01-01" } });

      const propRange = date("2024-01-01", "2024-01-31");
      expect(propRange).toEqual({
        date: { start: "2024-01-01", end: "2024-01-31" },
      });
    });
  });

  describe("API key validation", () => {
    it("throws when NOTION_API_KEY not set", async () => {
      const original = process.env.NOTION_API_KEY;
      process.env.NOTION_API_KEY = undefined;

      const { request } = await import("./client");

      try {
        await request("GET", "/users/me");
      } catch (e) {
        const error = e as Error;
        expect(error.message).toContain("NOTION_API_KEY");
      }

      process.env.NOTION_API_KEY = original;
    });
  });
});

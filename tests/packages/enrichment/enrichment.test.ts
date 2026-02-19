/**
 * Enrichment Service Tests
 *
 * Run: bun test tests/packages/enrichment/enrichment.test.ts
 */
import { describe, expect, it } from "bun:test";
import { getGravatarUrl, getUIAvatarUrl } from "@enrichment/avatars";
import { getLogoUrl } from "@enrichment/clearbit";
import { extractContactInfo } from "@enrichment/pdl/person";

describe("enrichment service", () => {
  describe("clearbit", () => {
    it("generates logo URL for domain", () => {
      const url = getLogoUrl("google.com");
      expect(url).toBe("https://logo.clearbit.com/google.com");
    });
  });

  describe("avatars", () => {
    it("generates gravatar URL from email", () => {
      const url = getGravatarUrl("test@example.com");
      expect(url).toContain("gravatar.com/avatar/");
      expect(url).toContain("?d=404&s=200");
    });

    it("generates UI avatar URL from name", () => {
      const url = getUIAvatarUrl("John Doe");
      expect(url).toContain("ui-avatars.com/api/");
      expect(url).toContain("name=John%20Doe");
    });

    it("respects size parameter", () => {
      const gravatarUrl = getGravatarUrl("test@example.com", 100);
      expect(gravatarUrl).toContain("s=100");

      const uiAvatarUrl = getUIAvatarUrl("John", 100);
      expect(uiAvatarUrl).toContain("size=100");
    });
  });

  describe("pdl", () => {
    it("extracts contact info from PDL response", () => {
      const person = {
        full_name: "John Doe",
        job_company_name: "Acme Inc",
        job_title: "Engineer",
        linkedin_url: "https://linkedin.com/in/johndoe",
        location_name: "San Francisco, CA",
        mobile_phone: "555-1234",
      };

      const info = extractContactInfo(person);

      expect(info.name).toBe("John Doe");
      expect(info.title).toBe("Engineer");
      expect(info.company).toBe("Acme Inc");
      expect(info.linkedIn).toBe("https://linkedin.com/in/johndoe");
      expect(info.phone).toBe("555-1234");
      expect(info.location).toBe("San Francisco, CA");
    });

    it("handles missing fields", () => {
      const info = extractContactInfo({});

      expect(info.name).toBeNull();
      expect(info.title).toBeNull();
      expect(info.company).toBeNull();
    });

    it("uses phone_numbers fallback if no mobile_phone", () => {
      const info = extractContactInfo({
        phone_numbers: ["555-9999", "555-8888"],
      });

      expect(info.phone).toBe("555-9999");
    });
  });
});

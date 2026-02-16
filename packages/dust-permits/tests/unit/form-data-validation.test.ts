import { describe, expect, test } from "bun:test";
import { buildFormData } from "@/form-data";
import {
  validateBuiltFormData,
  validateFormDataOverrides,
} from "@/lib/form-data-validation";

describe("FormData override validation", () => {
  test("rejects unknown override keys", () => {
    const result = validateFormDataOverrides({
      categoryB1: {
        fakeField: true,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("fakeField");
    }
  });

  test("accepts known optional keys omitted from defaults", () => {
    const result = validateFormDataOverrides({
      primaryContact: {
        mobile: "(602) 555-0000",
      },
      propertyOwner: {
        entityType: "Limited Liability Company",
        name: "Example Owner LLC",
        address1: "123 Main St",
        city: "Phoenix",
        state: "AZ",
        zip: "85001",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("Built FormData validation", () => {
  test("requires C4 applyWaterPrevent other text when 'other' is selected", () => {
    const data = buildFormData({
      overrides: {
        categoryC4: {
          applyWaterPreventMethods: ["other"],
          applyWaterPreventOtherText: "",
        },
      },
    });

    const result = validateBuiltFormData(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("categoryC4.applyWaterPreventOtherText");
    }
  });

  test("requires C4 preventAccess methods to be empty when preventAccess is None", () => {
    const data = buildFormData({
      overrides: {
        categoryC4: {
          preventAccess: "None",
          preventAccessMethods: ["ditches"],
        },
      },
    });

    const result = validateBuiltFormData(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("categoryC4.preventAccessMethods");
      expect(result.error).toContain("must be empty");
    }
  });

  test("requires categoryE1.deviceTypeOther when deviceType includes 'other'", () => {
    const data = buildFormData({
      overrides: {
        categoryE1: {
          deviceType: ["other"],
          deviceTypeOther: "",
        },
      },
    });

    const result = validateBuiltFormData(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("categoryE1.deviceTypeOther");
    }
  });

  test("accepts valid conditional data", () => {
    const data = buildFormData({
      overrides: {
        categoryC4: {
          applyWaterPreventMethods: ["ditches", "other"],
          applyWaterPreventOtherText: "compaction and wattles",
          preventAccess: "Primary",
          preventAccessMethods: ["trees"],
        },
      },
    });

    const result = validateBuiltFormData(data);
    expect(result.success).toBe(true);
  });
});

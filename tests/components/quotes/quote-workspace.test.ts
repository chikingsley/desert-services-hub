/**
 * Tests for Quote Workspace utility functions
 *
 * Tests the apiToEditorQuote conversion and related logic
 * used for auto-refresh when external updates are detected.
 */
import { describe, expect, it } from "bun:test";
import type { EditorQuote } from "@/lib/types";

// ============================================================================
// Types (matching quote-workspace.tsx)
// ============================================================================

interface ApiQuoteResponse {
  id: string;
  base_number: string;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  updated_at: string;
  current_version?: {
    id: string;
    total: number;
    sections: Array<{ id: string; name: string; sort_order: number }>;
    line_items: Array<{
      id: string;
      section_id: string | null;
      description: string;
      quantity: number;
      unit: string;
      unit_price: number;
      is_excluded: number;
      notes: string | null;
      sort_order: number;
    }>;
  };
}

// ============================================================================
// Function Under Test (extracted from quote-workspace.tsx)
// ============================================================================

function apiToEditorQuote(
  api: ApiQuoteResponse,
  current: EditorQuote
): EditorQuote {
  const version = api.current_version;
  if (!version) {
    return current;
  }

  return {
    estimateNumber: api.base_number,
    date: current.date,
    estimator: current.estimator,
    estimatorEmail: current.estimatorEmail,
    billTo: {
      companyName: api.client_name ?? "",
      address: current.billTo.address,
      email: api.client_email ?? "",
      phone: api.client_phone ?? "",
    },
    jobInfo: {
      siteName: api.job_name,
      address: api.job_address ?? "",
    },
    sections: version.sections.map((s) => ({
      id: s.id,
      name: s.name,
    })),
    lineItems: version.line_items.map((item) => ({
      id: item.id,
      item: item.description,
      description: item.notes ?? "",
      qty: item.quantity,
      uom: item.unit,
      cost: item.unit_price,
      total: item.quantity * item.unit_price,
      sectionId: item.section_id ?? undefined,
      isStruck: item.is_excluded === 1,
    })),
    total: version.total,
  };
}

// ============================================================================
// Test Data
// ============================================================================

const mockCurrentQuote: EditorQuote = {
  estimateNumber: "250101001",
  date: "2025-01-01T00:00:00Z",
  estimator: "John Doe",
  estimatorEmail: "john@example.com",
  billTo: {
    companyName: "Old Client",
    address: "123 Old St",
    email: "old@example.com",
    phone: "555-0100",
  },
  jobInfo: {
    siteName: "Old Job",
    address: "456 Old Ave",
  },
  sections: [],
  lineItems: [],
  total: 0,
};

// ============================================================================
// Tests
// ============================================================================

describe("apiToEditorQuote", () => {
  it("returns current quote if no current_version", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "New Job",
      job_address: "789 New Blvd",
      client_name: "New Client",
      client_email: "new@example.com",
      client_phone: "555-0200",
      updated_at: "2025-01-02T00:00:00Z",
      // No current_version
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result).toBe(mockCurrentQuote);
  });

  it("updates estimate number from API", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101999",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 0,
        sections: [],
        line_items: [],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.estimateNumber).toBe("250101999");
  });

  it("preserves date, estimator, and estimatorEmail from current", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 0,
        sections: [],
        line_items: [],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.date).toBe(mockCurrentQuote.date);
    expect(result.estimator).toBe(mockCurrentQuote.estimator);
    expect(result.estimatorEmail).toBe(mockCurrentQuote.estimatorEmail);
  });

  it("updates billTo with API data while preserving address", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: "New Client Name",
      client_email: "newclient@example.com",
      client_phone: "555-9999",
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 0,
        sections: [],
        line_items: [],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.billTo.companyName).toBe("New Client Name");
    expect(result.billTo.email).toBe("newclient@example.com");
    expect(result.billTo.phone).toBe("555-9999");
    expect(result.billTo.address).toBe(mockCurrentQuote.billTo.address);
  });

  it("handles null values in billTo fields", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 0,
        sections: [],
        line_items: [],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.billTo.companyName).toBe("");
    expect(result.billTo.email).toBe("");
    expect(result.billTo.phone).toBe("");
  });

  it("updates jobInfo from API", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Phoenix Construction",
      job_address: "1234 Phoenix Way",
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 0,
        sections: [],
        line_items: [],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.jobInfo.siteName).toBe("Phoenix Construction");
    expect(result.jobInfo.address).toBe("1234 Phoenix Way");
  });

  it("handles null job_address", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 0,
        sections: [],
        line_items: [],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.jobInfo.address).toBe("");
  });

  it("converts sections correctly", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 0,
        sections: [
          { id: "sec-1", name: "Fencing", sort_order: 0 },
          { id: "sec-2", name: "Gates", sort_order: 1 },
        ],
        line_items: [],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toEqual({ id: "sec-1", name: "Fencing" });
    expect(result.sections[1]).toEqual({ id: "sec-2", name: "Gates" });
  });

  it("converts line items correctly", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 250,
        sections: [],
        line_items: [
          {
            id: "item-1",
            section_id: null,
            description: "Temp Fence Install",
            quantity: 100,
            unit: "LF",
            unit_price: 2.5,
            is_excluded: 0,
            notes: "Standard installation",
            sort_order: 0,
          },
        ],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.lineItems).toHaveLength(1);

    const item = result.lineItems[0];
    expect(item.id).toBe("item-1");
    expect(item.item).toBe("Temp Fence Install");
    expect(item.description).toBe("Standard installation");
    expect(item.qty).toBe(100);
    expect(item.uom).toBe("LF");
    expect(item.cost).toBe(2.5);
    expect(item.total).toBe(250);
    expect(item.sectionId).toBeUndefined();
    expect(item.isStruck).toBe(false);
  });

  it("handles line item with section_id", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 100,
        sections: [{ id: "sec-1", name: "Fencing", sort_order: 0 }],
        line_items: [
          {
            id: "item-1",
            section_id: "sec-1",
            description: "Item in section",
            quantity: 10,
            unit: "EA",
            unit_price: 10,
            is_excluded: 0,
            notes: null,
            sort_order: 0,
          },
        ],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.lineItems[0].sectionId).toBe("sec-1");
  });

  it("handles struck/excluded line items", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 0, // Excluded items don't count
        sections: [],
        line_items: [
          {
            id: "item-1",
            section_id: null,
            description: "Struck item",
            quantity: 100,
            unit: "EA",
            unit_price: 100,
            is_excluded: 1,
            notes: null,
            sort_order: 0,
          },
        ],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.lineItems[0].isStruck).toBe(true);
  });

  it("handles null notes in line items", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 100,
        sections: [],
        line_items: [
          {
            id: "item-1",
            section_id: null,
            description: "Item without notes",
            quantity: 10,
            unit: "EA",
            unit_price: 10,
            is_excluded: 0,
            notes: null,
            sort_order: 0,
          },
        ],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.lineItems[0].description).toBe("");
  });

  it("calculates line item total correctly", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 825,
        sections: [],
        line_items: [
          {
            id: "item-1",
            section_id: null,
            description: "Fence",
            quantity: 330,
            unit: "LF",
            unit_price: 2.5,
            is_excluded: 0,
            notes: null,
            sort_order: 0,
          },
        ],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.lineItems[0].total).toBe(825); // 330 * 2.5
    expect(result.total).toBe(825);
  });

  it("handles multiple line items", () => {
    const api: ApiQuoteResponse = {
      id: "quote-1",
      base_number: "250101002",
      job_name: "Test Job",
      job_address: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "v1",
        total: 650,
        sections: [],
        line_items: [
          {
            id: "item-1",
            section_id: null,
            description: "Fence Install",
            quantity: 100,
            unit: "LF",
            unit_price: 2.5,
            is_excluded: 0,
            notes: null,
            sort_order: 0,
          },
          {
            id: "item-2",
            section_id: null,
            description: "Gate",
            quantity: 2,
            unit: "EA",
            unit_price: 200,
            is_excluded: 0,
            notes: null,
            sort_order: 1,
          },
        ],
      },
    };

    const result = apiToEditorQuote(api, mockCurrentQuote);
    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0].total).toBe(250); // 100 * 2.5
    expect(result.lineItems[1].total).toBe(400); // 2 * 200
    expect(result.total).toBe(650);
  });
});

describe("external update detection logic", () => {
  // Helper to check for external changes (mirrors component logic)
  function hasExternalChange(
    lastKnown: string | null,
    newTimestamp: string
  ): boolean {
    return Boolean(lastKnown && newTimestamp !== lastKnown);
  }

  // Helper to check if we should poll (mirrors component logic)
  function shouldCheckForUpdates(
    saveStatus: "saved" | "saving" | "unsaved"
  ): boolean {
    return saveStatus !== "unsaved" && saveStatus !== "saving";
  }

  it("detects change when updated_at differs", () => {
    expect(
      hasExternalChange("2025-01-01T10:00:00Z", "2025-01-01T10:05:00Z")
    ).toBe(true);
  });

  it("no change when updated_at matches", () => {
    expect(
      hasExternalChange("2025-01-01T10:00:00Z", "2025-01-01T10:00:00Z")
    ).toBe(false);
  });

  it("no change detection when lastKnown is null", () => {
    expect(hasExternalChange(null, "2025-01-01T10:05:00Z")).toBe(false);
  });

  it("skips check when saveStatus is unsaved", () => {
    expect(shouldCheckForUpdates("unsaved")).toBe(false);
  });

  it("skips check when saveStatus is saving", () => {
    expect(shouldCheckForUpdates("saving")).toBe(false);
  });

  it("allows check when saveStatus is saved", () => {
    expect(shouldCheckForUpdates("saved")).toBe(true);
  });
});

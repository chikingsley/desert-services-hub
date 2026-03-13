import { describe, expect, it } from "bun:test";
import type { EditorEstimate } from "@lib/db/types";
import {
  type ApiEstimateResponse,
  apiToEditorEstimate,
  apiToInitialEditorEstimate,
  editorToApiPayload,
} from "@/apps/web/frontend/components/estimates/estimate-workspace-helpers";

const currentEstimate: EditorEstimate = {
  estimateNumber: "250101001",
  date: "2025-01-01T00:00:00Z",
  estimator: "Existing Estimator",
  estimatorEmail: "existing@example.com",
  billTo: {
    companyName: "Existing Client",
    address: "123 Existing St",
    email: "existing-client@example.com",
    phone: "555-0100",
  },
  jobInfo: {
    siteName: "Existing Job",
    address: "456 Existing Ave",
  },
  sections: [],
  lineItems: [],
  total: 0,
};

describe("estimate workspace helpers", () => {
  it("keeps the current editor estimate when the API has no current version", () => {
    const api: ApiEstimateResponse = {
      id: "estimate-1",
      base_number: "250101777",
      client_address: null,
      client_email: null,
      client_name: "Fresh Client",
      client_phone: null,
      estimator: "Fresh Estimator",
      estimator_email: "fresh@example.com",
      job_address: null,
      job_name: "Fresh Job",
      updated_at: "2025-01-02T00:00:00Z",
    };

    expect(apiToEditorEstimate(api, currentEstimate)).toBe(currentEstimate);
  });

  it("maps the current version into editor state and normalizes newline addresses", () => {
    const api: ApiEstimateResponse = {
      id: "estimate-2",
      base_number: "250101888",
      client_address: "230 S Siesta Lane\nTempe, Arizona 85288",
      client_email: "client@example.com",
      client_name: "New Client",
      client_phone: "555-0200",
      estimator: "New Estimator",
      estimator_email: "new-estimator@example.com",
      job_address: "3633 E Thunderbird Road\nPhoenix, Arizona 85032",
      job_name: "Thunderbird Job",
      updated_at: "2025-01-02T00:00:00Z",
      current_version: {
        id: "version-1",
        total: 999,
        sections: [
          {
            id: "section-1",
            name: "Mobilization",
            title: "Site Setup",
            sort_order: 0,
          },
        ],
        line_items: [
          {
            id: "line-1",
            section_id: "section-1",
            item_name: null,
            description: "Primary scope",
            quantity: 3,
            unit: "EA",
            unit_price: 125,
            is_excluded: 1,
            notes: "backup text",
            sort_order: 0,
          },
        ],
      },
    };

    const result = apiToEditorEstimate(api, currentEstimate);

    expect(result).toEqual({
      estimateNumber: "250101888",
      date: currentEstimate.date,
      estimator: "New Estimator",
      estimatorEmail: "new-estimator@example.com",
      billTo: {
        companyName: "New Client",
        address: "230 S Siesta Lane, Tempe, Arizona 85288",
        email: "client@example.com",
        phone: "555-0200",
      },
      jobInfo: {
        siteName: "Thunderbird Job",
        address: "3633 E Thunderbird Road, Phoenix, Arizona 85032",
      },
      sections: [
        {
          id: "section-1",
          name: "Mobilization",
          title: "Site Setup",
        },
      ],
      lineItems: [
        {
          id: "line-1",
          item: "Primary scope",
          description: "Primary scope",
          qty: 3,
          uom: "EA",
          cost: 125,
          total: 375,
          sectionId: "section-1",
          isAlternate: true,
        },
      ],
      total: 999,
    });
  });

  it("builds an empty editor estimate when the API row has no current version", () => {
    const api: ApiEstimateResponse = {
      id: "estimate-3",
      base_number: "250101999",
      client_address: "230 S Siesta Lane\nTempe, Arizona 85288",
      client_email: "client@example.com",
      client_name: "No Version Client",
      client_phone: "555-0300",
      created_at: "2025-01-03T00:00:00Z",
      estimator: "No Version Estimator",
      estimator_email: "no-version@example.com",
      job_address: "3633 E Thunderbird Road\nPhoenix, Arizona 85032",
      job_name: "No Version Job",
      updated_at: "2025-01-03T00:00:00Z",
    };

    expect(apiToInitialEditorEstimate(api)).toEqual({
      estimateNumber: "250101999",
      date: "2025-01-03T00:00:00Z",
      estimator: "No Version Estimator",
      estimatorEmail: "no-version@example.com",
      billTo: {
        companyName: "No Version Client",
        address: "230 S Siesta Lane, Tempe, Arizona 85288",
        email: "client@example.com",
        phone: "555-0300",
      },
      jobInfo: {
        siteName: "No Version Job",
        address: "3633 E Thunderbird Road, Phoenix, Arizona 85032",
      },
      sections: [],
      lineItems: [],
      total: 0,
    });
  });

  it("serializes editor state back to the API payload and drops blank line items", () => {
    const estimate: EditorEstimate = {
      ...currentEstimate,
      estimateNumber: "250101123",
      billTo: {
        companyName: "Serialized Client",
        address: "123 Serialized St",
        email: "serialized@example.com",
        phone: "555-0400",
      },
      jobInfo: {
        siteName: "Serialized Job",
        address: "456 Serialized Ave",
      },
      sections: [{ id: "section-1", name: "Earthwork", title: "Earthwork" }],
      lineItems: [
        {
          id: "line-1",
          item: "Mobilization",
          description: "Mobilize crew",
          qty: 2,
          uom: "EA",
          cost: 100,
          total: 200,
          sectionId: "section-1",
        },
        {
          id: "line-2",
          item: "   ",
          description: "Should be filtered out",
          qty: 1,
          uom: "EA",
          cost: 999,
          total: 999,
        },
      ],
      total: 1199,
    };

    expect(editorToApiPayload(estimate)).toEqual({
      base_number: "250101123",
      job_name: "Serialized Job",
      job_address: "456 Serialized Ave",
      estimator: "Existing Estimator",
      estimator_email: "existing@example.com",
      client_name: "Serialized Client",
      client_address: "123 Serialized St",
      client_email: "serialized@example.com",
      client_phone: "555-0400",
      status: "draft",
      total: 200,
      sections: [{ id: "section-1", name: "Earthwork", title: "Earthwork" }],
      line_items: [
        {
          section_id: "section-1",
          item_name: "Mobilization",
          description: "Mobilize crew",
          quantity: 2,
          unit: "EA",
          unit_price: 100,
          notes: null,
          is_excluded: 0,
        },
      ],
    });
  });
});

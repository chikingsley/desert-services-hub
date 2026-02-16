import type { EditorEstimate } from "@lib/db/types";

export interface ApiEstimateResponse {
  id: string;
  base_number: string;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  estimator: string | null;
  estimator_email: string | null;
  client_address: string | null;
  client_email: string | null;
  client_phone: string | null;
  updated_at: string;
  current_version?: {
    id: string;
    total: number;
    sections: Array<{
      id: string;
      name: string;
      title?: string;
      sort_order: number;
    }>;
    line_items: Array<{
      id: string;
      section_id: string | null;
      item_name: string | null;
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

function getLineItemRateAndTotal(item: {
  quantity: number;
  unit_price: number;
}): {
  rate: number;
  total: number;
} {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitPrice = Number.isFinite(item.unit_price) ? item.unit_price : 0;

  return {
    rate: unitPrice,
    total: quantity * unitPrice,
  };
}

export function apiToEditorEstimate(
  api: ApiEstimateResponse,
  current: EditorEstimate
): EditorEstimate {
  const version = api.current_version;
  if (!version) {
    return current;
  }

  return {
    estimateNumber: api.base_number || current.estimateNumber,
    date: current.date,
    estimator: api.estimator ?? current.estimator,
    estimatorEmail: api.estimator_email ?? current.estimatorEmail,
    billTo: {
      companyName: api.client_name ?? "",
      address: (api.client_address ?? current.billTo.address).replaceAll(
        "\n",
        ", "
      ),
      email: api.client_email ?? "",
      phone: api.client_phone ?? "",
    },
    jobInfo: {
      siteName: api.job_name,
      address: (api.job_address ?? "").replaceAll("\n", ", "),
    },
    sections: version.sections.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
    })),
    lineItems: version.line_items.map((item) => {
      const { rate, total } = getLineItemRateAndTotal(item);

      return {
        id: item.id,
        item: item.item_name ?? item.description,
        description: item.description || item.notes || "",
        qty: item.quantity,
        uom: item.unit,
        cost: rate,
        total,
        sectionId: item.section_id ?? undefined,
        isAlternate: item.is_excluded === 1,
      };
    }),
    total: version.total,
  };
}

export function editorToApiPayload(estimate: EditorEstimate) {
  const nonEmptyLineItems = estimate.lineItems.filter(
    (item) => item.item.trim() !== ""
  );
  const computedTotal = nonEmptyLineItems.reduce(
    (sum, item) => sum + item.total,
    0
  );

  return {
    base_number: estimate.estimateNumber,
    job_name: estimate.jobInfo.siteName || "Untitled Estimate",
    job_address: estimate.jobInfo.address || null,
    estimator: estimate.estimator || null,
    estimator_email: estimate.estimatorEmail || null,
    client_name: estimate.billTo.companyName || null,
    client_address: estimate.billTo.address || null,
    client_email: estimate.billTo.email || null,
    client_phone: estimate.billTo.phone || null,
    status: "draft" as const,
    total: computedTotal,
    sections: estimate.sections.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
    })),
    line_items: nonEmptyLineItems.map((item) => ({
      section_id: item.sectionId,
      item_name: item.item,
      description: item.description,
      quantity: item.qty,
      unit: item.uom,
      unit_price: item.cost,
      notes: null,
      is_excluded: item.isAlternate ? 1 : 0,
    })),
  };
}

/**
 * Estimate Editor Page
 */

import type {
  EditorEstimate,
  EditorLineItem,
  EditorSection,
} from "@lib/db/types";
import { useParams } from "react-router";
import useSWR from "swr";
import { EstimateWorkspace } from "@/apps/web/frontend/components/estimates/estimate-workspace";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

// API response types
interface ApiLineItem {
  description: string;
  id: string;
  is_excluded: number;
  item_name: string | null;
  notes: string | null;
  quantity: number;
  section_id: string | null;
  unit: string;
  unit_price: number;
}

interface ApiSection {
  id: string;
  name: string;
}

interface ApiVersion {
  created_at: string;
  estimate_id: string;
  id: string;
  is_current: number;
  line_items: ApiLineItem[];
  sections: ApiSection[];
  total: number;
  version_number: number;
}

interface ApiEstimateResponse {
  base_number: string;
  client_address: string | null;
  client_email: string | null;
  client_name: string | null;
  client_phone: string | null;
  created_at: string;
  current_version: ApiVersion;
  estimator: string | null;
  estimator_email: string | null;
  id: string;
  is_locked: number;
  job_address: string | null;
  job_name: string;
  linked_takeoff?: { id: string; name: string } | null;
  notes: string | null;
  status: string;
  takeoff_id: string | null;
  updated_at: string;
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

// Transform API response to EditorEstimate format
function transformToEditorEstimate(api: ApiEstimateResponse): EditorEstimate {
  const version = api.current_version;

  const sections: EditorSection[] = (version.sections || []).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  const lineItems: EditorLineItem[] = (version.line_items || []).map((item) => {
    const { rate, total } = getLineItemRateAndTotal(item);

    return {
      id: item.id,
      item: item.item_name || item.description,
      description: item.description || item.notes || "",
      qty: item.quantity,
      uom: item.unit,
      cost: rate,
      total,
      sectionId: item.section_id || undefined,
      isAlternate: item.is_excluded === 1,
    };
  });

  const total = lineItems.reduce((sum, item) => sum + item.total, 0);

  return {
    estimateNumber: api.base_number,
    date: api.created_at || new Date().toISOString(),
    estimator: api.estimator || "",
    estimatorEmail: api.estimator_email || "",
    billTo: {
      companyName: api.client_name || "",
      address: (api.client_address || "").replaceAll("\n", ", "),
      email: api.client_email || "",
      phone: api.client_phone || "",
    },
    jobInfo: {
      siteName: api.job_name || "",
      address: (api.job_address || "").replaceAll("\n", ", "),
    },
    sections,
    lineItems,
    total,
  };
}

export function EstimateEditorPage() {
  const { id } = useParams();
  const {
    data: apiEstimate,
    error,
    isLoading,
  } = useSWR<ApiEstimateResponse>(id ? `/api/estimates/${id}` : null, fetcher);

  if (error) {
    return <PageError message={error.message} />;
  }

  if (isLoading || !apiEstimate) {
    return <PageLoading />;
  }

  const initialEstimate = transformToEditorEstimate(apiEstimate);
  const linkedTakeoff = apiEstimate.linked_takeoff || null;

  return (
    <EstimateWorkspace
      estimateId={apiEstimate.id}
      initialEstimate={initialEstimate}
      initialIsLocked={apiEstimate.is_locked === 1}
      initialUpdatedAt={apiEstimate.updated_at}
      jobName={apiEstimate.job_name || apiEstimate.base_number}
      linkedTakeoff={linkedTakeoff}
      versionId={apiEstimate.current_version.id}
    />
  );
}

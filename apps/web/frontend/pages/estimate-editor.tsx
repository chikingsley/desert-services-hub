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
  id: string;
  description: string;
  notes: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  section_id: string | null;
}

interface ApiSection {
  id: string;
  name: string;
}

interface ApiVersion {
  id: string;
  estimate_id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
  sections: ApiSection[];
  line_items: ApiLineItem[];
}

interface ApiEstimateResponse {
  id: string;
  base_number: string;
  takeoff_id: string | null;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  notes: string | null;
  status: string;
  is_locked: number;
  created_at: string;
  updated_at: string;
  current_version: ApiVersion;
  linked_takeoff?: { id: string; name: string } | null;
}

// Transform API response to EditorEstimate format
function transformToEditorEstimate(api: ApiEstimateResponse): EditorEstimate {
  const version = api.current_version;

  const sections: EditorSection[] = (version.sections || []).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  const lineItems: EditorLineItem[] = (version.line_items || []).map(
    (item) => ({
      id: item.id,
      item: item.description,
      description: item.notes || "",
      qty: item.quantity,
      uom: item.unit,
      cost: item.unit_price,
      total: item.quantity * item.unit_price,
      sectionId: item.section_id || undefined,
    })
  );

  const total = lineItems.reduce((sum, item) => sum + item.total, 0);

  return {
    estimateNumber: api.base_number,
    date: api.created_at || new Date().toISOString(),
    estimator: "",
    estimatorEmail: "",
    billTo: {
      companyName: api.client_name || "",
      address: "",
      email: api.client_email || "",
      phone: api.client_phone || "",
    },
    jobInfo: {
      siteName: api.job_name || "",
      address: api.job_address || "",
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
      initialUpdatedAt={apiEstimate.updated_at}
      jobName={apiEstimate.job_name || apiEstimate.base_number}
      linkedTakeoff={linkedTakeoff}
      versionId={apiEstimate.current_version.id}
    />
  );
}

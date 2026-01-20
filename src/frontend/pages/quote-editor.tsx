/**
 * Quote Editor Page
 */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { QuoteWorkspace } from "@/components/quotes/quote-workspace";
import type { EditorLineItem, EditorQuote, EditorSection } from "@/lib/types";

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
  quote_id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
  sections: ApiSection[];
  line_items: ApiLineItem[];
}

interface ApiQuoteResponse {
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

// Loader function for fetching a single quote
export async function quoteLoader({ params }: LoaderFunctionArgs) {
  const response = await fetch(`/api/quotes/${params.id}`);
  if (!response.ok) {
    throw new Error("Failed to load quote");
  }
  return response.json();
}

// Transform API response to EditorQuote format
function transformToEditorQuote(api: ApiQuoteResponse): EditorQuote {
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

export function QuoteEditorPage() {
  const apiQuote = useLoaderData() as ApiQuoteResponse;

  const initialQuote = transformToEditorQuote(apiQuote);
  const linkedTakeoff = apiQuote.linked_takeoff || null;

  return (
    <QuoteWorkspace
      initialQuote={initialQuote}
      jobName={apiQuote.job_name || apiQuote.base_number}
      linkedTakeoff={linkedTakeoff}
      quoteId={apiQuote.id}
      versionId={apiQuote.current_version.id}
    />
  );
}

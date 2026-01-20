/**
 * Quotes List Page
 */
import { useLoaderData } from "react-router";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuotesEmptyActions } from "@/components/quotes/quotes-empty-actions";
import { QuotesHeaderActions } from "@/components/quotes/quotes-header-actions";
import {
  QuotesTable,
  type QuoteWithVersion,
} from "@/components/quotes/quotes-table";

// API response shape for quote versions
interface QuoteVersionFromApi {
  id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
}

interface QuoteFromApi {
  id: string;
  base_number: string;
  job_name: string;
  client_name: string | null;
  status: string;
  is_locked: number;
  created_at: string;
  takeoff_id: string | null;
  versions: QuoteVersionFromApi[];
}

// Loader function for fetching quotes
export async function quotesLoader() {
  const response = await fetch("/api/quotes");
  if (!response.ok) {
    throw new Error("Failed to load quotes");
  }
  return response.json();
}

export function QuotesPage() {
  const apiQuotes = useLoaderData() as QuoteFromApi[];

  // Transform API response to match QuotesTable props
  const quotes: QuoteWithVersion[] = apiQuotes.map((q) => {
    const currentVersion = q.versions?.find((v) => v.is_current === 1) || null;
    return {
      id: q.id,
      base_number: q.base_number,
      job_name: q.job_name,
      client_name: q.client_name,
      status: q.status,
      created_at: q.created_at,
      current_version: currentVersion,
      takeoff_id: q.takeoff_id,
    };
  });

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={<QuotesHeaderActions />}
        breadcrumbs={[{ label: "Quotes" }]}
        title="Quotes"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="page-transition">
          {quotes.length === 0 ? (
            <EmptyState
              action={<QuotesEmptyActions />}
              description="Upload a PDF plan to measure and create quotes from takeoffs, or start a manual quote from scratch."
              title="No quotes yet"
            />
          ) : (
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <QuotesTable quotes={quotes} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

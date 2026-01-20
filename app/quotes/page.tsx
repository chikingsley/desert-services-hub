import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuotesEmptyActions } from "@/components/quotes/quotes-empty-actions";
import { QuotesHeaderActions } from "@/components/quotes/quotes-header-actions";
import { QuotesTable } from "@/components/quotes/quotes-table";
import { db } from "@/lib/db";
import type { QuoteRow } from "@/lib/types";

interface QuoteWithVersionsJson extends QuoteRow {
  versions: string;
  takeoff_id: string | null;
}

export const dynamic = "force-dynamic";

export default function QuotesPage() {
  // Fetch quotes with versions from SQLite
  const quotes = db
    .prepare(
      `SELECT q.*,
        (SELECT json_group_array(json_object(
          'id', v.id,
          'version_number', v.version_number,
          'total', v.total,
          'is_current', v.is_current,
          'created_at', v.created_at
        )) FROM quote_versions v WHERE v.quote_id = q.id) as versions
      FROM quotes q
      ORDER BY q.created_at DESC`
    )
    .all() as QuoteWithVersionsJson[];

  const quotesWithCurrentVersion = quotes.map((quote) => {
    const versions = JSON.parse(quote.versions || "[]");
    const currentVersion = versions.find(
      (v: { is_current: number }) => v.is_current === 1
    );
    return {
      ...quote,
      is_locked: quote.is_locked === 1,
      current_version: currentVersion || null,
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
          {quotesWithCurrentVersion.length === 0 ? (
            <EmptyState
              action={<QuotesEmptyActions />}
              description="Upload a PDF plan to measure and create quotes from takeoffs, or start a manual quote from scratch."
              title="No quotes yet"
            />
          ) : (
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <QuotesTable quotes={quotesWithCurrentVersion} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

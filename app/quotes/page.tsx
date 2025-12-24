import { Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuotesTable } from "@/components/quotes/quotes-table";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function QuotesPage() {
  const supabase = await createClient();

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select(`
      *,
      quote_versions (
        id,
        version_number,
        total,
        is_current,
        created_at
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "Error fetching quotes:",
      error.message,
      error.code,
      error.details
    );
  }

  const quotesWithCurrentVersion =
    quotes?.map((quote) => {
      const currentVersion = quote.quote_versions?.find(
        (v: { is_current: boolean }) => v.is_current
      );
      return {
        ...quote,
        current_version: currentVersion || null,
      };
    }) || [];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <Button asChild>
            <Link href="/quotes/new">
              <Plus className="mr-2 h-4 w-4" />
              New Quote
            </Link>
          </Button>
        }
        breadcrumbs={[{ label: "Quotes" }]}
        title="Quotes"
      />

      <div className="flex-1 p-6">
        {quotesWithCurrentVersion.length === 0 ? (
          <EmptyState
            action={
              <Button asChild>
                <Link href="/quotes/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Quote
                </Link>
              </Button>
            }
            description="Create your first quote to get started with estimates."
            title="No quotes yet"
          />
        ) : (
          <QuotesTable quotes={quotesWithCurrentVersion} />
        )}
      </div>
    </div>
  );
}

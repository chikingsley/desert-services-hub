/**
 * Quotes List Page
 */
import { useLoaderData } from "react-router";
import { PageHeader } from "@/components/page-header";

// Loader function for fetching quotes
export async function quotesLoader() {
  const response = await fetch("/api/quotes");
  if (!response.ok) throw new Error("Failed to load quotes");
  return response.json();
}

export function QuotesPage() {
  const quotes = useLoaderData() as unknown[];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        description="Manage your quotes and estimates"
        title="Quotes"
      />
      <div className="flex-1 p-6 lg:p-8">
        <p className="text-muted-foreground">
          {quotes.length} quotes loaded. Full UI coming soon.
        </p>
        <pre className="mt-4 max-h-96 overflow-auto rounded bg-muted p-4 text-sm">
          {JSON.stringify(quotes, null, 2)}
        </pre>
      </div>
    </div>
  );
}

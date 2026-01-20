/**
 * Quote Editor Page
 */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useParams } from "react-router";
import { PageHeader } from "@/components/page-header";

// Loader function for fetching a single quote
export async function quoteLoader({ params }: LoaderFunctionArgs) {
  const response = await fetch(`/api/quotes/${params.id}`);
  if (!response.ok) throw new Error("Failed to load quote");
  return response.json();
}

export function QuoteEditorPage() {
  const quote = useLoaderData() as Record<string, unknown>;
  const { id } = useParams();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        description={`Editing quote ${id}`}
        title={(quote.job_name as string) || "Quote Editor"}
      />
      <div className="flex-1 p-6 lg:p-8">
        <p className="text-muted-foreground">Quote editor UI coming soon.</p>
        <pre className="mt-4 max-h-96 overflow-auto rounded bg-muted p-4 text-sm">
          {JSON.stringify(quote, null, 2)}
        </pre>
      </div>
    </div>
  );
}

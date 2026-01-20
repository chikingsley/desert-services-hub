/**
 * Takeoffs List Page
 */
import { useLoaderData } from "react-router";
import { PageHeader } from "@/components/page-header";

// Loader function for fetching takeoffs
export async function takeoffsLoader() {
  const response = await fetch("/api/takeoffs");
  if (!response.ok) throw new Error("Failed to load takeoffs");
  return response.json();
}

export function TakeoffsPage() {
  const takeoffs = useLoaderData() as unknown[];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader description="Manage your PDF takeoffs" title="Takeoffs" />
      <div className="flex-1 p-6 lg:p-8">
        <p className="text-muted-foreground">
          {takeoffs.length} takeoffs loaded. Full UI coming soon.
        </p>
        <pre className="mt-4 max-h-96 overflow-auto rounded bg-muted p-4 text-sm">
          {JSON.stringify(takeoffs, null, 2)}
        </pre>
      </div>
    </div>
  );
}

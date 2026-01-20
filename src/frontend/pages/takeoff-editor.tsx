/**
 * Takeoff Editor Page
 */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useParams } from "react-router";
import { PageHeader } from "@/components/page-header";

// Loader function for fetching a single takeoff
export async function takeoffLoader({ params }: LoaderFunctionArgs) {
  const response = await fetch(`/api/takeoffs/${params.id}`);
  if (!response.ok) throw new Error("Failed to load takeoff");
  return response.json();
}

export function TakeoffEditorPage() {
  const takeoff = useLoaderData() as Record<string, unknown>;
  const { id } = useParams();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        description={`Editing takeoff ${id}`}
        title={(takeoff.name as string) || "Takeoff Editor"}
      />
      <div className="flex-1 p-6 lg:p-8">
        <p className="text-muted-foreground">Takeoff editor UI coming soon.</p>
        <pre className="mt-4 max-h-96 overflow-auto rounded bg-muted p-4 text-sm">
          {JSON.stringify(takeoff, null, 2)}
        </pre>
      </div>
    </div>
  );
}

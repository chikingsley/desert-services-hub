/**
 * Estimates List Page
 */
import { useLoaderData } from "react-router";
import { EmptyState } from "@/apps/web/frontend/components/empty-state";
import { EstimatesEmptyActions } from "@/apps/web/frontend/components/estimates/estimates-empty-actions";
import { EstimatesHeaderActions } from "@/apps/web/frontend/components/estimates/estimates-header-actions";
import {
  EstimatesTable,
  type EstimateWithVersion,
} from "@/apps/web/frontend/components/estimates/estimates-table";
import { PageHeader } from "@/apps/web/frontend/components/page-header";

// API response shape for estimate versions
interface EstimateVersionFromApi {
  id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
}

interface EstimateFromApi {
  id: string;
  base_number: string;
  job_name: string;
  client_name: string | null;
  status: string;
  is_locked: number;
  created_at: string;
  takeoff_id: string | null;
  versions: EstimateVersionFromApi[];
}

// Loader function for fetching estimates
export async function estimatesLoader() {
  const response = await fetch("/api/estimates");
  if (!response.ok) {
    throw new Error("Failed to load estimates");
  }
  return response.json();
}

export function EstimatesPage() {
  const apiEstimates = useLoaderData() as EstimateFromApi[];

  // Transform API response to match EstimatesTable props
  const estimates: EstimateWithVersion[] = apiEstimates.map((q) => {
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
        actions={<EstimatesHeaderActions />}
        breadcrumbs={[{ label: "Estimates" }]}
        title="Estimates"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="page-transition">
          {estimates.length === 0 ? (
            <EmptyState
              action={<EstimatesEmptyActions />}
              description="Upload a PDF plan to measure and create estimates from takeoffs, or start a manual estimate from scratch."
              title="No estimates yet"
            />
          ) : (
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <EstimatesTable estimates={estimates} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

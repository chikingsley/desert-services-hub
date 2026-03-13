import { useParams } from "react-router";
import useSWR from "swr";
import { EstimateWorkspace } from "@/apps/web/frontend/components/estimates/estimate-workspace";
import {
  type ApiEstimateResponse,
  apiToInitialEditorEstimate,
} from "@/apps/web/frontend/components/estimates/estimate-workspace-helpers";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

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

  if (!apiEstimate.current_version) {
    return <PageError message="Estimate has no current version." />;
  }

  const initialEstimate = apiToInitialEditorEstimate(apiEstimate);
  const linkedTakeoff = apiEstimate.linked_takeoff || null;

  return (
    <EstimateWorkspace
      estimateId={apiEstimate.id}
      initialEstimate={initialEstimate}
      initialIsLocked={apiEstimate.is_locked === 1}
      initialUpdatedAt={apiEstimate.updated_at}
      jobName={apiEstimate.job_name || apiEstimate.base_number}
      linkedTakeoff={linkedTakeoff}
      versionId={apiEstimate.current_version.id}
    />
  );
}

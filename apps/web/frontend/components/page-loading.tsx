/**
 * Shared loading state for pages that fetch data via SWR.
 * Shows a skeleton layout while data loads.
 */
import { Skeleton } from "@/apps/web/frontend/components/ui/skeleton";

const STATS_SKELETON_KEYS = ["stat-1", "stat-2", "stat-3", "stat-4"] as const;
const ROW_SKELETON_KEYS = [
  "row-1",
  "row-2",
  "row-3",
  "row-4",
  "row-5",
  "row-6",
] as const;

export function PageLoading() {
  return (
    <div className="flex flex-1 flex-col p-6 lg:p-8">
      <div className="space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS_SKELETON_KEYS.map((key) => (
            <Skeleton className="h-16 rounded-xl" key={key} />
          ))}
        </div>
        {/* Table */}
        <Skeleton className="h-10 rounded-xl" />
        {ROW_SKELETON_KEYS.map((key) => (
          <Skeleton className="h-12 rounded-lg" key={key} />
        ))}
      </div>
    </div>
  );
}

export function PageError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <p className="font-medium text-destructive">Failed to load</p>
        <p className="mt-1 text-muted-foreground text-sm">{message}</p>
      </div>
    </div>
  );
}

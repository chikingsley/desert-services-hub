/**
 * Shared loading state for pages that fetch data via SWR.
 * Shows a skeleton layout while data loads.
 */
import { Skeleton } from "@/apps/web/frontend/components/ui/skeleton";

export function PageLoading() {
  return (
    <div className="flex flex-1 flex-col p-6 lg:p-8">
      <div className="space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton className="h-16 rounded-xl" key={i} />
          ))}
        </div>
        {/* Table */}
        <Skeleton className="h-10 rounded-xl" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton className="h-12 rounded-lg" key={i} />
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

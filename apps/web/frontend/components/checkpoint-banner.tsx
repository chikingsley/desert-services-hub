/**
 * Checkpoint Banner
 *
 * Polls /api/checkpoints for pending operator checkpoints.
 * When one exists, shows an overlay banner with Yes/No buttons.
 * The automation script pauses until the operator responds.
 */

import { AlertTriangle, Check, X } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface Checkpoint {
  context?: Record<string, unknown>;
  createdAt: string;
  id: string;
  label: string;
  status: "pending" | "approved" | "declined";
}

interface CheckpointListResponse {
  checkpoints: Checkpoint[];
}

export function CheckpointBanner() {
  const { data, mutate } = useSWR<CheckpointListResponse>(
    "/api/checkpoints",
    fetcher,
    { refreshInterval: 1000, dedupingInterval: 500 }
  );

  const pending =
    data?.checkpoints?.filter((c) => c.status === "pending") ?? [];

  const respond = useCallback(
    async (id: string, action: "approve" | "decline", label: string) => {
      try {
        await fetch(`/api/checkpoints/${id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        toast.success(
          action === "approve" ? `Approved: ${label}` : `Declined: ${label}`
        );
        await mutate();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        toast.error(`Checkpoint response failed: ${msg}`);
      }
    },
    [mutate]
  );

  if (pending.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {pending.map((cp) => (
        <div
          className="fade-in slide-in-from-top-2 flex animate-in items-center gap-4 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 px-4 py-3"
          key={cp.id}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="font-medium text-sm">{cp.label}</p>
            {cp.context && (
              <p className="text-muted-foreground text-xs">
                {Object.entries(cp.context)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" | ")}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              className="gap-1.5 bg-green-600 hover:bg-green-700"
              onClick={() => respond(cp.id, "approve", cp.label)}
              size="sm"
            >
              <Check className="h-4 w-4" />
              Yes
            </Button>
            <Button
              className="gap-1.5"
              onClick={() => respond(cp.id, "decline", cp.label)}
              size="sm"
              variant="destructive"
            >
              <X className="h-4 w-4" />
              No
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

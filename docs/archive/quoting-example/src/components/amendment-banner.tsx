import { Check, FilePen, Lock, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type { QuoteStatus } from "../types";

type AmendmentBannerProps = {
  status: QuoteStatus;
  currentVersion: number;
  pendingChangesCount: number;
  isAmending: boolean;
  onLock: () => void;
  onStartAmendment: () => void;
  onFinalizeAmendment: () => void;
  onDiscardAmendment: () => void;
};

const statusConfig: Record<
  QuoteStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  locked: { label: "Locked", variant: "outline" },
  amended: { label: "Amending", variant: "destructive" },
};

export function AmendmentBanner({
  status,
  currentVersion,
  pendingChangesCount,
  isAmending,
  onLock,
  onStartAmendment,
  onFinalizeAmendment,
  onDiscardAmendment,
}: AmendmentBannerProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2 py-1.5">
      <Badge className="px-1.5 py-0 text-[10px]" variant={config.variant}>
        {config.label}
      </Badge>
      {currentVersion > 0 && (
        <span className="text-[10px] text-muted-foreground">
          v{currentVersion}
        </span>
      )}
      {isAmending && pendingChangesCount > 0 && (
        <span className="text-[10px] text-warning">
          {pendingChangesCount} change{pendingChangesCount === 1 ? "" : "s"}
        </span>
      )}

      {status === "draft" && (
        <Button
          className="h-6 gap-1 px-2 text-xs"
          onClick={onLock}
          size="sm"
          variant="ghost"
        >
          <Lock className="h-3 w-3" />
          Lock
        </Button>
      )}

      {status === "locked" && (
        <Button
          className="h-6 gap-1 px-2 text-xs"
          onClick={onStartAmendment}
          size="sm"
          variant="ghost"
        >
          <FilePen className="h-3 w-3" />
          Amend
        </Button>
      )}

      {isAmending && (
        <>
          <Button
            className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
            onClick={onDiscardAmendment}
            size="sm"
            variant="ghost"
          >
            <X className="h-3 w-3" />
          </Button>
          <Button
            className="h-6 gap-1 px-2 text-xs"
            onClick={onFinalizeAmendment}
            size="sm"
            variant="default"
          >
            <Check className="h-3 w-3" />
            Save
          </Button>
        </>
      )}
    </div>
  );
}

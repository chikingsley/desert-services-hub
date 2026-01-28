/**
 * Contract card - draggable unit of work in the pipeline.
 * Uses @atlaskit/pragmatic-drag-and-drop for native drag support.
 */
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import {
  attachClosestEdge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  GripVertical,
  Paperclip,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type PipelineContract,
  type PipelineStage,
  STAGE_CONFIG,
} from "./types";

interface ContractCardProps {
  contract: PipelineContract;
  index: number;
  onSelect: (contract: PipelineContract) => void;
  onAdvance: (contract: PipelineContract) => void;
}

type DragState =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement }
  | { type: "dragging" };

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)}w ago`;
  }
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function MathIndicator({ contract }: { contract: PipelineContract }) {
  if (!contract.mathCheck) {
    return null;
  }

  const { matches, variance } = contract.mathCheck;

  if (matches) {
    return (
      <div className="flex items-center gap-1 text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span className="font-medium text-xs">Balanced</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-destructive">
      <XCircle className="h-3.5 w-3.5" />
      <span className="font-medium text-xs">
        {formatCurrency(Math.abs(variance))} off
      </span>
    </div>
  );
}

function FlagBadges({ contract }: { contract: PipelineContract }) {
  const errors = contract.flags.filter((f) => f.severity === "error");
  const warnings = contract.flags.filter((f) => f.severity === "warning");

  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {errors.length > 0 && (
        <Badge
          className="gap-1 border-destructive/20 bg-destructive/10 text-destructive"
          variant="outline"
        >
          <AlertTriangle className="h-3 w-3" />
          {errors.length}
        </Badge>
      )}
      {warnings.length > 0 && (
        <Badge
          className="gap-1 border-amber-500/20 bg-amber-500/10 text-amber-600"
          variant="outline"
        >
          <AlertTriangle className="h-3 w-3" />
          {warnings.length}
        </Badge>
      )}
    </div>
  );
}

function nextStageLabel(stage: PipelineStage): string {
  return STAGE_CONFIG[stage].verb;
}

export function ContractCard({
  contract,
  index,
  onSelect,
  onAdvance,
}: ContractCardProps) {
  const stageConfig = STAGE_CONFIG[contract.stage];
  const isDone = contract.stage === "done";
  const cardRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [dragState, setDragState] = useState<DragState>({ type: "idle" });
  const [closestEdge, setClosestEdge] = useState<"top" | "bottom" | null>(null);

  useEffect(() => {
    const element = cardRef.current;
    const handle = handleRef.current;
    if (!(element && handle)) {
      return;
    }

    return combine(
      draggable({
        element,
        dragHandle: handle,
        getInitialData: () => ({
          type: "contract",
          contractId: contract.id,
          stage: contract.stage,
          index,
        }),
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
            render({ container }) {
              if (container && typeof window !== "undefined") {
                setDragState({ type: "preview", container });
                return () => setDragState({ type: "dragging" });
              }
              // Empty cleanup function - no-op when container is not available
              return () => {
                // No-op cleanup
              };
            },
            nativeSetDragImage,
          });
        },
        onDragStart: () => setDragState({ type: "dragging" }),
        onDrop: () => {
          setDragState({ type: "idle" });
          setClosestEdge(null);
        },
      }),
      dropTargetForElements({
        element,
        getData: ({ input, element: el }) => {
          const data = {
            type: "contract",
            contractId: contract.id,
            stage: contract.stage,
            index,
          };
          return attachClosestEdge(data, {
            input,
            element: el,
            allowedEdges: ["top", "bottom"],
          });
        },
        canDrop: ({ source }) => source.data.type === "contract",
        getIsSticky: () => true,
        onDragEnter: ({ self, source }) => {
          if (source.data.contractId !== contract.id) {
            const edge = extractClosestEdge(self.data);
            setClosestEdge(edge === "left" || edge === "right" ? null : edge);
          }
        },
        onDrag: ({ self, source }) => {
          if (source.data.contractId !== contract.id) {
            const edge = extractClosestEdge(self.data);
            setClosestEdge(edge === "left" || edge === "right" ? null : edge);
          }
        },
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => {
          setClosestEdge(null);
          setDragState({ type: "idle" });
        },
      })
    );
  }, [contract.id, contract.stage, index]);

  // Cleanup drag state on unmount
  useEffect(() => {
    return () => {
      setDragState({ type: "idle" });
      setClosestEdge(null);
    };
  }, []);

  return (
    <>
      <div
        className={cn(
          "group relative rounded-lg border bg-card p-3.5 transition-all duration-200",
          "hover:shadow-md",
          isDone
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-border hover:border-primary/20",
          dragState.type === "dragging" && "scale-[0.97] opacity-40",
          closestEdge === "top" &&
            "before:pointer-events-none before:absolute before:-top-1.5 before:right-0 before:left-0 before:h-0.5 before:rounded-full before:bg-primary before:shadow-lg before:shadow-primary/30",
          closestEdge === "bottom" &&
            "after:pointer-events-none after:absolute after:right-0 after:-bottom-1.5 after:left-0 after:h-0.5 after:rounded-full after:bg-primary after:shadow-lg after:shadow-primary/30"
        )}
        ref={cardRef}
      >
        {/* Drag handle + header */}
        <div className="mb-2 flex items-start gap-2">
          <button
            aria-label="Drag to reorder"
            className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-muted-foreground/30 transition-colors hover:text-muted-foreground active:cursor-grabbing"
            ref={handleRef}
            type="button"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => onSelect(contract)}
            type="button"
          >
            <h4 className="truncate font-display font-medium text-foreground text-sm leading-tight">
              {contract.subject}
            </h4>
            <p className="mt-0.5 truncate text-muted-foreground text-xs">
              {contract.contractor}
            </p>
          </button>
          <div className="flex shrink-0 items-center gap-1 text-muted-foreground/60">
            <Clock className="h-3 w-3" />
            <span className="text-[10px]">
              {formatRelativeDate(contract.receivedDate)}
            </span>
          </div>
        </div>

        {/* Middle: amounts + math indicator */}
        <div className="mb-2.5 flex items-center justify-between pl-6">
          <div className="flex items-center gap-3">
            {contract.estimateTotal !== null && (
              <div className="text-xs">
                <span className="text-muted-foreground">Est </span>
                <span className="font-medium font-mono text-foreground">
                  {formatCurrency(contract.estimateTotal)}
                </span>
              </div>
            )}
            {contract.contractTotal !== null && (
              <div className="text-xs">
                <span className="text-muted-foreground">Con </span>
                <span className="font-medium font-mono text-foreground">
                  {formatCurrency(contract.contractTotal)}
                </span>
              </div>
            )}
          </div>
          <MathIndicator contract={contract} />
        </div>

        {/* Bottom: flags + attachments + action */}
        <div className="flex items-center justify-between gap-2 pl-6">
          <div className="flex items-center gap-2">
            <FlagBadges contract={contract} />
            {contract.attachmentCount > 0 && (
              <div className="flex items-center gap-0.5 text-muted-foreground/60">
                <Paperclip className="h-3 w-3" />
                <span className="text-[10px]">{contract.attachmentCount}</span>
              </div>
            )}
            {contract.notionUrl && (
              <a
                className="text-muted-foreground/40 transition-colors hover:text-primary"
                href={contract.notionUrl}
                onClick={(e) => e.stopPropagation()}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {!isDone && (
            <Button
              className={cn(
                "h-7 gap-1 px-2.5 text-xs opacity-0 transition-all group-hover:opacity-100",
                stageConfig.bgColor,
                stageConfig.color,
                "border-0 hover:brightness-95"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onAdvance(contract);
              }}
              size="sm"
              variant="outline"
            >
              {nextStageLabel(contract.stage)}
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}

          {isDone && (
            <div className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="font-medium text-[10px]">Complete</span>
            </div>
          )}
        </div>
      </div>

      {/* Custom drag preview */}
      {dragState.type === "preview" &&
        dragState.container &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            className="min-w-[240px] max-w-[320px] rounded-lg border border-primary/30 bg-card px-4 py-3 shadow-2xl shadow-primary/20"
            style={{ transform: "rotate(2deg)" }}
          >
            <div className="flex items-center gap-2">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
              <span className="truncate font-display font-medium text-sm">
                {contract.subject}
              </span>
            </div>
            <p className="mt-0.5 pl-5.5 text-muted-foreground text-xs">
              {contract.contractor}
            </p>
          </div>,
          dragState.container
        )}
    </>
  );
}

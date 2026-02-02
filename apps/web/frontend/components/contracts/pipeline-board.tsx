/**
 * Pipeline board - kanban columns with drag-and-drop via pragmatic-drag-and-drop.
 * Cards can be dragged between columns to change stage, or reordered within a column.
 */
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ContractCard } from "./contract-card";
import {
  PIPELINE_STAGES,
  type PipelineContract,
  type PipelineStage,
  STAGE_CONFIG,
} from "./types";

function emptyLabel(isDone: boolean): string {
  return isDone ? "Completed contracts appear here" : "No contracts";
}

interface PipelineBoardProps {
  contracts: PipelineContract[];
  onSelectContract: (contract: PipelineContract) => void;
  onAdvanceContract: (contract: PipelineContract) => void;
}

function StageColumn({
  stage,
  contracts,
  onSelect,
  onAdvance,
}: {
  stage: PipelineStage;
  contracts: PipelineContract[];
  onSelect: (contract: PipelineContract) => void;
  onAdvance: (contract: PipelineContract) => void;
}) {
  const config = STAGE_CONFIG[stage];
  const count = contracts.length;
  const isDone = stage === "done";
  const columnRef = useRef<HTMLDivElement>(null);
  const [isDraggedOver, setIsDraggedOver] = useState(false);

  useEffect(() => {
    const element = columnRef.current;
    if (!element) {
      return;
    }

    return dropTargetForElements({
      element,
      getData: () => ({ type: "column", stage }),
      canDrop: ({ source }) => source.data.type === "contract",
      getIsSticky: () => true,
      onDragEnter: () => setIsDraggedOver(true),
      onDragLeave: () => setIsDraggedOver(false),
      onDrop: () => setIsDraggedOver(false),
    });
  }, [stage]);

  return (
    <div className="flex min-h-0 min-w-[280px] flex-1 flex-col" ref={columnRef}>
      {/* Stage header */}
      <div
        className={cn(
          "mb-3 flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2.5 transition-all",
          config.bgColor,
          isDraggedOver
            ? `${config.borderColor} shadow-md ${config.glowColor}`
            : "border-transparent"
        )}
      >
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full transition-transform",
            isDone ? "bg-emerald-500" : "bg-current",
            config.color,
            isDraggedOver && "scale-125"
          )}
        />
        <span className={cn("font-display font-medium text-sm", config.color)}>
          {config.shortLabel}
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none",
            count > 0
              ? `${config.bgColor} ${config.color}`
              : "text-muted-foreground/40"
          )}
        >
          {count}
        </span>
      </div>

      {/* Cards */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden rounded-lg p-1 transition-colors",
          isDraggedOver && "bg-primary/5"
        )}
      >
        {contracts.length === 0 && (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-lg border border-border/50 border-dashed p-8 transition-all",
              isDraggedOver && "border-primary/30 bg-primary/5 shadow-inner"
            )}
          >
            <span className="text-center text-muted-foreground/40 text-xs">
              {isDraggedOver ? "Drop here" : emptyLabel(isDone)}
            </span>
          </div>
        )}
        {contracts.map((contract, i) => (
          <ContractCard
            contract={contract}
            index={i}
            key={contract.id}
            onAdvance={onAdvance}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({
  contracts,
  onSelectContract,
  onAdvanceContract,
}: PipelineBoardProps) {
  const groupedByStage = new Map<PipelineStage, PipelineContract[]>();

  for (const stage of PIPELINE_STAGES) {
    groupedByStage.set(stage, []);
  }

  for (const contract of contracts) {
    const stageContracts = groupedByStage.get(contract.stage);
    if (stageContracts) {
      stageContracts.push(contract);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((stage) => (
        <StageColumn
          contracts={groupedByStage.get(stage) ?? []}
          key={stage}
          onAdvance={onAdvanceContract}
          onSelect={onSelectContract}
          stage={stage}
        />
      ))}
    </div>
  );
}

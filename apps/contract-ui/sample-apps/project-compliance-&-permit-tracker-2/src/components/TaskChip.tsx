import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type ComplianceTask, PermitStage, TaskType } from "@/types";

interface TaskChipProps {
  task: ComplianceTask;
  onClick: () => void;
}

export const TaskChip: React.FC<TaskChipProps> = ({ task, onClick }) => {
  const completedCheckpoints = task.checkpoints.filter(
    (cp) => cp.isCompleted
  ).length;
  const totalCheckpoints = task.checkpoints.length;
  const progress =
    totalCheckpoints > 0 ? (completedCheckpoints / totalCheckpoints) * 100 : 0;

  if (!task.isRequired) {
    return (
      <Badge
        className="border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-400 opacity-60 grayscale"
        variant="outline"
      >
        {task.name}: N/A
      </Badge>
    );
  }

  let statusStyles = "bg-slate-100 text-slate-600 border-slate-200";
  let Icon = Clock;
  let iconColor = "text-slate-500";

  if (task.type === TaskType.BINARY) {
    if (task.status === true) {
      statusStyles =
        "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";
      Icon = CheckCircle2;
      iconColor = "text-emerald-600";
    } else {
      statusStyles =
        "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100";
      Icon = AlertCircle;
      iconColor = "text-amber-500";
    }
  } else if (task.type === TaskType.STAGED) {
    const stage = task.status as PermitStage;
    if (stage === PermitStage.COMPLETED) {
      statusStyles =
        "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";
      Icon = CheckCircle2;
      iconColor = "text-emerald-600";
    } else if (stage > PermitStage.NOT_STARTED) {
      statusStyles =
        "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100";
      iconColor = "text-indigo-600";
    }
  }

  const getStageLabel = (stage: PermitStage) => {
    switch (stage) {
      case PermitStage.PREPARED:
        return "Drafted";
      case PermitStage.FILED:
        return "Sent to Customer";
      case PermitStage.RECEIVED:
        return "Received / Finalized";
      case PermitStage.SENT_TO_BILLING:
        return "Sent to Billing";
      case PermitStage.COMPLETED:
        return "Active / Chilling";
      default:
        return "Not Started";
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "group relative flex min-w-[120px] flex-col gap-1 rounded-xl border px-3 py-2 text-left shadow-sm transition-all hover:ring-2 hover:ring-indigo-100 active:scale-95",
              statusStyles
            )}
            onClick={onClick}
            type="button"
          >
            <div className="flex items-center gap-2">
              <Icon className={cn("h-3.5 w-3.5", iconColor)} />
              <span className="font-bold text-[11px] tracking-tight">
                {task.name}
              </span>
            </div>

            {task.primaryAction && (
              <div className="mt-0.5 animate-pulse font-black text-[9px] text-indigo-600 uppercase tracking-tighter">
                Next: {task.primaryAction}
              </div>
            )}

            {totalCheckpoints > 0 && (
              <div className="mt-1 flex flex-col gap-1">
                <div className="flex justify-between font-black text-[8px] uppercase opacity-60">
                  <span>Progress</span>
                  <span>
                    {completedCheckpoints}/{totalCheckpoints}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-black/5">
                  <div
                    className="h-full bg-current opacity-40 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {task.type === TaskType.STAGED &&
              task.status !== PermitStage.COMPLETED && (
                <div className="mt-1 font-black text-[8px] uppercase tracking-widest opacity-60">
                  {getStageLabel(task.status as PermitStage)}
                </div>
              )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            Last updated:{" "}
            {task.lastUpdated
              ? new Date(task.lastUpdated).toLocaleDateString()
              : "Never"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

import type React from "react";
import type { ComplianceTask, PermitStage } from "../types";
import { AlertCircleIcon, CheckCircleIcon, ClockIcon } from "./Icons";

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
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-[11px] text-slate-400 opacity-60 grayscale">
        {task.name}: N/A
      </div>
    );
  }

  let statusColor = "bg-slate-100 text-slate-600 border-slate-200";
  let icon = <ClockIcon className="h-3.5 w-3.5" />;

  if (task.type === TaskType.BINARY) {
    if (task.status === true) {
      statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
      icon = <CheckCircleIcon className="h-3.5 w-3.5" />;
    } else {
      statusColor = "bg-amber-50 text-amber-700 border-amber-200";
      icon = <AlertCircleIcon className="h-3.5 w-3.5 text-amber-500" />;
    }
  } else if (task.type === TaskType.STAGED) {
    const stage = task.status as PermitStage;
    if (stage === PermitStage.COMPLETED) {
      statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
      icon = <CheckCircleIcon className="h-3.5 w-3.5" />;
    } else if (stage > PermitStage.NOT_STARTED) {
      statusColor = "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
  }

  return (
    <button
      className={`group relative flex min-w-[100px] flex-col gap-1 rounded-xl border px-3 py-2 text-left shadow-sm transition-all hover:ring-2 hover:ring-indigo-100 active:scale-95 ${statusColor}
      `}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-bold text-[11px] tracking-tight">
          {task.name}
        </span>
      </div>

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
          <div className="mt-1 font-black text-[9px] uppercase tracking-widest opacity-50">
            Stage {task.status}/5
          </div>
        )}
    </button>
  );
};

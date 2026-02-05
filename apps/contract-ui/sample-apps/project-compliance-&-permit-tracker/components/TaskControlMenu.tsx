import type React from "react";
import { useState } from "react";
import type { Checkpoint, ComplianceTask, TaskType } from "../types";
import { CheckCircleIcon } from "./Icons";

interface TaskControlMenuProps {
  task: ComplianceTask;
  onUpdateStatus: (status: any) => void;
  onToggleCheckpoint: (checkpointId: string) => void;
  onUpdateTaskSchema: (updates: Partial<ComplianceTask>) => void;
  onDeleteTask: () => void;
  onClose: () => void;
}

export const TaskControlMenu: React.FC<TaskControlMenuProps> = ({
  task,
  onUpdateStatus,
  onToggleCheckpoint,
  onUpdateTaskSchema,
  onDeleteTask,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"status" | "config">("status");
  const [newCheckpointLabel, setNewCheckpointLabel] = useState("");

  const handleAddCheckpoint = () => {
    if (!newCheckpointLabel.trim()) {
      return;
    }
    const newCp: Checkpoint = {
      id: Math.random().toString(36).substr(2, 9),
      label: newCheckpointLabel,
      isCompleted: false,
    };
    onUpdateTaskSchema({ checkpoints: [...task.checkpoints, newCp] });
    setNewCheckpointLabel("");
  };

  const handleRemoveCheckpoint = (id: string) => {
    onUpdateTaskSchema({
      checkpoints: task.checkpoints.filter((cp) => cp.id !== id),
    });
  };

  return (
    <div className="fade-in zoom-in absolute top-full left-0 z-[100] mt-2 w-80 origin-top-left animate-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl duration-200">
      {/* Tab Header */}
      <div className="flex border-slate-100 border-b">
        <button
          className={`flex-1 py-3 font-bold text-xs uppercase tracking-widest transition-colors ${activeTab === "status" ? "border-indigo-600 border-b-2 bg-white text-indigo-600" : "bg-slate-50/50 text-slate-400 hover:text-slate-600"}`}
          onClick={() => setActiveTab("status")}
        >
          Status
        </button>
        <button
          className={`flex-1 py-3 font-bold text-xs uppercase tracking-widest transition-colors ${activeTab === "config" ? "border-indigo-600 border-b-2 bg-white text-indigo-600" : "bg-slate-50/50 text-slate-400 hover:text-slate-600"}`}
          onClick={() => setActiveTab("config")}
        >
          Configure
        </button>
      </div>

      <div className="p-4">
        {activeTab === "status" ? (
          <>
            <div className="mb-4">
              <label className="mb-2 block font-black text-[10px] text-slate-400 uppercase tracking-tighter">
                Primary Action
              </label>
              {task.type === TaskType.BINARY ? (
                <button
                  className={`w-full rounded-xl border py-2.5 font-bold text-sm transition-all ${task.status ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}
                  onClick={() => onUpdateStatus(!task.status)}
                >
                  {task.status ? "Requirement Met" : "Mark as Complete"}
                </button>
              ) : task.type === TaskType.STAGED ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      className={`rounded-lg border py-2 font-bold text-xs transition-all ${task.status === s ? "scale-105 border-indigo-600 bg-indigo-600 text-white shadow-md" : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-300"}`}
                      key={s}
                      onClick={() => onUpdateStatus(s)}
                    >
                      Stg {s}
                    </button>
                  ))}
                  <button
                    className="rounded-lg border bg-slate-100 py-2 font-bold text-[10px] text-slate-400"
                    onClick={() => onUpdateStatus(0)}
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <textarea
                  className="min-h-[80px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  onChange={(e) => onUpdateStatus(e.target.value)}
                  placeholder="Update narrative..."
                  value={task.status as string}
                />
              )}
            </div>

            {task.checkpoints.length > 0 && (
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                <label className="mb-1 block font-black text-[10px] text-slate-400 uppercase tracking-tighter">
                  Checkpoints
                </label>
                {task.checkpoints.map((cp) => (
                  <div
                    className="group flex cursor-pointer items-center gap-2.5 rounded-lg bg-slate-50/50 p-2 transition-colors hover:bg-slate-100"
                    key={cp.id}
                    onClick={() => onToggleCheckpoint(cp.id)}
                  >
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${cp.isCompleted ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white group-hover:border-indigo-400"}`}
                    >
                      {cp.isCompleted && (
                        <CheckCircleIcon className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <span
                      className={`font-semibold text-[11px] transition-colors ${cp.isCompleted ? "text-slate-400 line-through" : "text-slate-700"}`}
                    >
                      {cp.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block font-black text-[10px] text-slate-400 uppercase">
                Requirement Name
              </label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-bold text-xs"
                onChange={(e) => onUpdateTaskSchema({ name: e.target.value })}
                type="text"
                value={task.name}
              />
            </div>

            <div>
              <label className="mb-1 block font-black text-[10px] text-slate-400 uppercase">
                Type
              </label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-medium text-xs"
                onChange={(e) =>
                  onUpdateTaskSchema({ type: e.target.value as TaskType })
                }
                value={task.type}
              >
                <option value={TaskType.BINARY}>Yes/No Toggle</option>
                <option value={TaskType.STAGED}>5-Stage Workflow</option>
                <option value={TaskType.NARRATIVE}>Text Narrative</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block font-black text-[10px] text-slate-400 uppercase">
                Edit Checkpoints
              </label>
              <div className="mb-3 max-h-32 space-y-2 overflow-y-auto pr-1">
                {task.checkpoints.map((cp) => (
                  <div
                    className="flex items-center justify-between gap-2 rounded bg-slate-50 p-1.5 font-medium text-[10px] text-slate-600"
                    key={cp.id}
                  >
                    <span className="truncate">{cp.label}</span>
                    <button
                      className="text-slate-300 hover:text-red-500"
                      onClick={() => handleRemoveCheckpoint(cp.id)}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px]"
                  onChange={(e) => setNewCheckpointLabel(e.target.value)}
                  placeholder="New step..."
                  type="text"
                  value={newCheckpointLabel}
                />
                <button
                  className="rounded-lg bg-indigo-600 px-3 font-bold text-white text-xs"
                  onClick={handleAddCheckpoint}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex gap-2 border-slate-100 border-t pt-2">
              <button
                className="flex-1 rounded-lg bg-red-50 py-2 font-bold text-[10px] text-red-600 hover:bg-red-100"
                onClick={onDeleteTask}
              >
                Delete Requirement
              </button>
              <button
                className="flex-1 rounded-lg bg-slate-900 py-2 font-bold text-[10px] text-white hover:bg-slate-800"
                onClick={onClose}
              >
                Done Editing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

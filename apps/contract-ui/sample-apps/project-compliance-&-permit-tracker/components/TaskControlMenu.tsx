
import React, { useState } from 'react';
import { ComplianceTask, TaskType, PermitStage, Checkpoint } from '../types';
import { CheckCircleIcon, AlertCircleIcon, EditIcon } from './Icons';

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
  onClose 
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'config'>('status');
  const [newCheckpointLabel, setNewCheckpointLabel] = useState('');

  const handleAddCheckpoint = () => {
    if (!newCheckpointLabel.trim()) return;
    const newCp: Checkpoint = {
      id: Math.random().toString(36).substr(2, 9),
      label: newCheckpointLabel,
      isCompleted: false
    };
    onUpdateTaskSchema({ checkpoints: [...task.checkpoints, newCp] });
    setNewCheckpointLabel('');
  };

  const handleRemoveCheckpoint = (id: string) => {
    onUpdateTaskSchema({ checkpoints: task.checkpoints.filter(cp => cp.id !== id) });
  };

  return (
    <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-left">
      {/* Tab Header */}
      <div className="flex border-b border-slate-100">
        <button 
          onClick={() => setActiveTab('status')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'status' ? 'text-indigo-600 bg-white border-b-2 border-indigo-600' : 'text-slate-400 bg-slate-50/50 hover:text-slate-600'}`}
        >
          Status
        </button>
        <button 
          onClick={() => setActiveTab('config')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'config' ? 'text-indigo-600 bg-white border-b-2 border-indigo-600' : 'text-slate-400 bg-slate-50/50 hover:text-slate-600'}`}
        >
          Configure
        </button>
      </div>

      <div className="p-4">
        {activeTab === 'status' ? (
          <>
            <div className="mb-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter block mb-2">Primary Action</label>
              {task.type === TaskType.BINARY ? (
                <button 
                  onClick={() => onUpdateStatus(!task.status)}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold border transition-all ${task.status ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}
                >
                  {task.status ? 'Requirement Met' : 'Mark as Complete'}
                </button>
              ) : task.type === TaskType.STAGED ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button
                      key={s}
                      onClick={() => onUpdateStatus(s)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${task.status === s ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-105' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-slate-300'}`}
                    >
                      Stg {s}
                    </button>
                  ))}
                  <button
                    onClick={() => onUpdateStatus(0)}
                    className="py-2 text-[10px] font-bold rounded-lg border bg-slate-100 text-slate-400"
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <textarea 
                  value={task.status as string}
                  onChange={(e) => onUpdateStatus(e.target.value)}
                  placeholder="Update narrative..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs min-h-[80px] outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>

            {task.checkpoints.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter block mb-1">Checkpoints</label>
                {task.checkpoints.map(cp => (
                  <div 
                    key={cp.id} 
                    onClick={() => onToggleCheckpoint(cp.id)}
                    className="flex items-center gap-2.5 p-2 bg-slate-50/50 rounded-lg cursor-pointer group hover:bg-slate-100 transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${cp.isCompleted ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300 group-hover:border-indigo-400'}`}>
                      {cp.isCompleted && <CheckCircleIcon className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-[11px] font-semibold transition-colors ${cp.isCompleted ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
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
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Requirement Name</label>
              <input 
                type="text" 
                value={task.name}
                onChange={(e) => onUpdateTaskSchema({ name: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Type</label>
              <select 
                value={task.type}
                onChange={(e) => onUpdateTaskSchema({ type: e.target.value as TaskType })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
              >
                <option value={TaskType.BINARY}>Yes/No Toggle</option>
                <option value={TaskType.STAGED}>5-Stage Workflow</option>
                <option value={TaskType.NARRATIVE}>Text Narrative</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Edit Checkpoints</label>
              <div className="space-y-2 mb-3 max-h-32 overflow-y-auto pr-1">
                {task.checkpoints.map(cp => (
                  <div key={cp.id} className="flex items-center justify-between gap-2 p-1.5 bg-slate-50 rounded text-[10px] font-medium text-slate-600">
                    <span className="truncate">{cp.label}</span>
                    <button 
                      onClick={() => handleRemoveCheckpoint(cp.id)}
                      className="text-slate-300 hover:text-red-500"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                <input 
                  type="text" 
                  value={newCheckpointLabel}
                  onChange={(e) => setNewCheckpointLabel(e.target.value)}
                  placeholder="New step..."
                  className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px]"
                />
                <button 
                  onClick={handleAddCheckpoint}
                  className="px-3 bg-indigo-600 text-white rounded-lg text-xs font-bold"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button 
                onClick={onDeleteTask}
                className="flex-1 py-2 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100"
              >
                Delete Requirement
              </button>
              <button 
                onClick={onClose}
                className="flex-1 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-slate-800"
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

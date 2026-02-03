
import React from 'react';
import { PermitStage } from '../types';

interface StageStepperProps {
  currentStage: PermitStage;
  onChange: (stage: PermitStage) => void;
  disabled?: boolean;
}

const STAGES = [
  { label: 'Not Started', value: PermitStage.NOT_STARTED },
  { label: 'Prepared', value: PermitStage.PREPARED },
  { label: 'Filed', value: PermitStage.FILED },
  { label: 'Received', value: PermitStage.RECEIVED },
  { label: 'Billing', value: PermitStage.SENT_TO_BILLING },
  { label: 'Done', value: PermitStage.COMPLETED },
];

export const StageStepper: React.FC<StageStepperProps> = ({ currentStage, onChange, disabled }) => {
  return (
    <div className="flex flex-col gap-1 w-full max-w-xs">
      <div className="flex items-center justify-between gap-1">
        {STAGES.map((stage, idx) => {
          const isActive = currentStage >= stage.value;
          const isCurrent = currentStage === stage.value;
          
          return (
            <button
              key={stage.value}
              disabled={disabled}
              onClick={() => onChange(stage.value)}
              title={stage.label}
              className={`
                flex-1 h-2 rounded-full transition-all duration-300
                ${isActive ? 'bg-blue-600' : 'bg-slate-200'}
                ${isCurrent ? 'ring-2 ring-blue-300 ring-offset-1 scale-y-125' : ''}
                ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:scale-y-110 cursor-pointer'}
              `}
            />
          );
        })}
      </div>
      <div className="text-[10px] text-slate-500 font-medium flex justify-between px-0.5">
        <span>{STAGES[currentStage].label}</span>
        <span>{currentStage}/5</span>
      </div>
    </div>
  );
};

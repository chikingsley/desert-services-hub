import type React from "react";
import { PermitStage } from "../types";

interface StageStepperProps {
  currentStage: PermitStage;
  onChange: (stage: PermitStage) => void;
  disabled?: boolean;
}

const STAGES = [
  { label: "Not Started", value: PermitStage.NOT_STARTED },
  { label: "Prepared", value: PermitStage.PREPARED },
  { label: "Filed", value: PermitStage.FILED },
  { label: "Received", value: PermitStage.RECEIVED },
  { label: "Billing", value: PermitStage.SENT_TO_BILLING },
  { label: "Done", value: PermitStage.COMPLETED },
];

export const StageStepper: React.FC<StageStepperProps> = ({
  currentStage,
  onChange,
  disabled,
}) => {
  return (
    <div className="flex w-full max-w-xs flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        {STAGES.map((stage, _idx) => {
          const isActive = currentStage >= stage.value;
          const isCurrent = currentStage === stage.value;

          return (
            <button
              className={`h-2 flex-1 rounded-full transition-all duration-300 ${isActive ? "bg-blue-600" : "bg-slate-200"}
                ${isCurrent ? "scale-y-125 ring-2 ring-blue-300 ring-offset-1" : ""}
                ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:scale-y-110"}
              `}
              disabled={disabled}
              key={stage.value}
              onClick={() => onChange(stage.value)}
              title={stage.label}
            />
          );
        })}
      </div>
      <div className="flex justify-between px-0.5 font-medium text-[10px] text-slate-500">
        <span>{STAGES[currentStage].label}</span>
        <span>{currentStage}/5</span>
      </div>
    </div>
  );
};

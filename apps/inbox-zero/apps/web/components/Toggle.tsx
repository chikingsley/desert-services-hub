import type { FieldError } from "react-hook-form";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { Switch } from "@/components/ui/switch";
import { ErrorMessage, ExplainText, Label } from "./Input";

export interface ToggleProps {
  disabled?: boolean;
  enabled: boolean;
  error?: FieldError;
  explainText?: string;
  label?: string;
  labelRight?: string;
  name: string;
  onChange: (enabled: boolean) => void;
  tooltipText?: string;
}

export const Toggle = (props: ToggleProps) => {
  const { label, labelRight, tooltipText, enabled, onChange, disabled } = props;

  return (
    <div>
      <div className="flex items-center">
        {label && (
          <span className="mr-3 flex items-center gap-1 text-nowrap">
            <Label label={label} name={props.name} />
            {tooltipText && <TooltipExplanation text={tooltipText} />}
          </span>
        )}
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onChange}
        />
        {labelRight && (
          <span className="ml-3 flex items-center gap-1 text-nowrap">
            <Label label={labelRight} name={props.name} />
            {tooltipText && <TooltipExplanation text={tooltipText} />}
          </span>
        )}
      </div>
      {props.explainText ? (
        <ExplainText>{props.explainText}</ExplainText>
      ) : null}
      {props.error?.message ? (
        <ErrorMessage message={props.error?.message} />
      ) : null}
    </div>
  );
};

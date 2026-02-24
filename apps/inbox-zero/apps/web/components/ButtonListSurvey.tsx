import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

export function ButtonListSurvey({
  options,
  onClick,
  className,
}: {
  options: {
    label: string;
    value: string;
    recommended?: boolean;
  }[];
  onClick: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex max-w-lg flex-col gap-3", className)}>
      {options.map((option) => (
        <Button
          className={cn(
            "relative w-full",
            option.recommended && "ring-1 ring-black ring-inset dark:ring-white"
          )}
          key={option.value}
          onClick={() => onClick(option.value)}
          variant="outline"
        >
          <span className="absolute inset-0 flex items-center justify-center">
            {option.label}
          </span>
          {option.recommended && (
            <span className="relative ml-auto">
              <Badge className="ml-2">Recommended</Badge>
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}

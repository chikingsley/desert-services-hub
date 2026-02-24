import { AlertCircle, TerminalIcon } from "lucide-react";
import type React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/utils";

export function AlertBasic({
  title,
  description,
  icon,
  variant,
  className,
}: {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode | null;
  variant?: "default" | "destructive" | "success" | "blue";
  className?: string;
}) {
  return (
    <Alert className={className} variant={variant}>
      {icon === null ? null : icon || <TerminalIcon className="h-4 w-4" />}
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  );
}

export function AlertWithButton({
  title,
  description,
  icon,
  variant,
  button,
  className,
}: {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
  variant?: "default" | "destructive" | "success" | "blue";
  button?: React.ReactNode;
  className?: string;
}) {
  return (
    <Alert
      className={cn("bg-background pt-5 pb-3", className)}
      variant={variant}
    >
      {icon === null ? null : icon || <TerminalIcon className="h-4 w-4" />}
      <div className="flex items-center justify-between">
        <div>
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </div>
        <div>{button}</div>
      </div>
    </Alert>
  );
}

export function AlertError({
  title,
  description,
  className,
}: {
  title: string;
  description: React.ReactNode;
  className?: string;
}) {
  return (
    <Alert className={className} variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

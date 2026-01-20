import { FileText } from "lucide-react";
import type React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="page-transition relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-border/60 border-dashed bg-card/50 p-10 text-center">
      {/* Decorative background elements */}
      <div className="absolute top-1/4 left-1/4 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-2xl" />
      <div className="absolute right-1/4 bottom-1/4 h-24 w-24 translate-x-1/2 translate-y-1/2 rounded-full bg-accent/10 blur-xl" />

      <div className="relative z-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary/10 to-primary/5 shadow-lg shadow-primary/5">
          {icon || <FileText className="h-7 w-7 text-primary" />}
        </div>
        <h3 className="mt-6 font-display font-semibold text-foreground text-xl tracking-tight">
          {title}
        </h3>
        <p className="mt-3 max-w-sm text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
        {action && <div className="mt-8">{action}</div>}
      </div>
    </div>
  );
}

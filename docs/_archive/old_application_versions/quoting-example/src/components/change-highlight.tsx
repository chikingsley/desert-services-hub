import type { ReactNode } from "react";

type ChangeType = "added" | "removed" | "modified" | "none";

type ChangeHighlightProps = {
  children: ReactNode;
  changeType: ChangeType;
  previousValue?: unknown;
  showPreviousValue?: boolean;
};

const changeStyles: Record<ChangeType, string> = {
  added: "ring-2 ring-change-added/50 bg-change-added-bg",
  removed: "ring-2 ring-change-removed/50 bg-change-removed-bg opacity-60",
  modified: "ring-2 ring-change-modified/50 bg-change-modified-bg",
  none: "",
};

const indicatorStyles: Record<ChangeType, string> = {
  added: "bg-change-added",
  removed: "bg-change-removed",
  modified: "bg-change-modified",
  none: "",
};

export function ChangeHighlight({
  children,
  changeType,
  previousValue,
  showPreviousValue = true,
}: ChangeHighlightProps) {
  if (changeType === "none") {
    return <>{children}</>;
  }

  return (
    <div className={`relative rounded ${changeStyles[changeType]}`}>
      {/* Change indicator dot */}
      <div
        className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ${indicatorStyles[changeType]}`}
      />

      {/* Content */}
      <div className={changeType === "removed" ? "line-through" : ""}>
        {children}
      </div>

      {/* Previous value tooltip for modified items */}
      {changeType === "modified" &&
        showPreviousValue &&
        previousValue !== undefined && (
          <div className="absolute -bottom-5 left-0 whitespace-nowrap text-[10px] text-muted-foreground">
            was: {formatValue(previousValue)}
          </div>
        )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  return String(value);
}

// Helper component for row-level change indicators
type RowChangeIndicatorProps = {
  changeType: ChangeType;
};

export function RowChangeIndicator({ changeType }: RowChangeIndicatorProps) {
  if (changeType === "none") {
    return null;
  }

  const labels: Record<ChangeType, string> = {
    added: "NEW",
    removed: "REMOVED",
    modified: "CHANGED",
    none: "",
  };

  const styles: Record<ChangeType, string> = {
    added: "bg-change-added-bg text-change-added border-change-added/50",
    removed:
      "bg-change-removed-bg text-change-removed border-change-removed/50",
    modified:
      "bg-change-modified-bg text-change-modified border-change-modified/50",
    none: "",
  };

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-medium text-[10px] ${styles[changeType]}`}
    >
      {labels[changeType]}
    </span>
  );
}

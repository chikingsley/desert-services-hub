import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ReviewQueueCardProps<T> {
  className?: string;
  description?: string;
  empty: ReactNode;
  getKey: (item: T) => number | string;
  items: T[];
  maxBodyHeightClassName?: string;
  renderItem: (item: T) => ReactNode;
  title: string;
}

export function ReviewQueueCard<T>({
  className,
  description,
  empty,
  getKey,
  items,
  maxBodyHeightClassName = "max-h-[1200px]",
  renderItem,
  title,
}: ReviewQueueCardProps<T>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      <div className="border-b px-4 py-3">
        <h2 className="font-medium text-sm">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>

      <div className={cn("overflow-auto", maxBodyHeightClassName)}>
        {items.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            {empty}
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

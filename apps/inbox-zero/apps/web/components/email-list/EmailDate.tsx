import { formatShortDate } from "@/utils/date";

export function EmailDate(props: { date: Date }) {
  return (
    <div className="flex-shrink-0 font-medium text-muted-foreground text-sm leading-5">
      {formatShortDate(props.date)}
    </div>
  );
}

import { ArchiveIcon, InboxIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CleanAction } from "@/generated/prisma/enums";
import { cn } from "@/utils";

export function CleanStats({
  stats,
  action,
}: {
  stats: {
    total: number;
    archived: number;
  };
  action: CleanAction;
}) {
  const inboxCount = stats.total - stats.archived;

  const chartData = [
    {
      label: "Keep in inbox",
      value: inboxCount,
      percentage: stats.total > 0 ? (inboxCount / stats.total) * 100 : 0,
      icon: InboxIcon,
      color: "bg-blue-500",
    },
    {
      label: action === CleanAction.ARCHIVE ? "Archived" : "Marked as read",
      value: stats.archived,
      percentage: stats.total > 0 ? (stats.archived / stats.total) * 100 : 0,
      icon: ArchiveIcon,
      color: "bg-green-500",
    },
  ];

  return (
    <div className="mt-2 space-y-4 overflow-y-auto rounded-md border bg-muted/20 p-4">
      <Card>
        <CardContent className="pt-6">
          <div className="font-bold text-2xl">
            {stats.total.toLocaleString()}
          </div>
          <p className="text-muted-foreground text-xs">Emails processed</p>

          <div className="mt-4 space-y-4">
            {chartData.map((item) => (
              <div className="space-y-1" key={item.label}>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                    <item.icon className="mr-1.5 h-3.5 w-3.5" />
                    <span>{item.label}</span>
                  </div>
                  <span className="font-medium">
                    {item.value.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress
                    className="h-2"
                    indicatorClassName={item.color}
                    value={item.percentage}
                  />
                  <span className="w-10 text-muted-foreground text-xs">
                    {item.percentage.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className: string;
  indicatorClassName: string;
}) {
  return (
    <div className={cn("relative h-2 rounded-full bg-gray-200", className)}>
      <div
        className={cn(
          "absolute inset-0 rounded-full bg-blue-500",
          indicatorClassName
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

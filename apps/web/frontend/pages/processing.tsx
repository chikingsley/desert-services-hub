/**
 * Attachment Processing Monitor
 *
 * Live view of the attachment extraction pipeline: queue stats,
 * daily throughput, and recent processing activity.
 */
import {
  CheckCircle2,
  Clock,
  Copy,
  FileWarning,
  SkipForward,
  XCircle,
} from "lucide-react";
import useSWR from "swr";
import { EmptyState } from "@/apps/web/frontend/components/empty-state";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { StatCard } from "@/apps/web/frontend/components/stat-card";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/apps/web/frontend/components/ui/table";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface QueueStats {
  pending: number;
  processing: number;
  success: number;
  failed: number;
  skipped: number;
  deduped: number;
  total: number;
}

interface RecentItem {
  id: number;
  name: string;
  email_id: number;
  content_type: string | null;
  size: number | null;
  extraction_status: string;
  extraction_error: string | null;
  extracted_at: string | null;
  content_hash: string | null;
  mailbox_email: string;
  subject: string | null;
  from_email: string | null;
  project_id: number | null;
}

interface DailyThroughput {
  date: string;
  succeeded: number;
  failed: number;
  deduped: number;
  skipped: number;
}

interface MonitoringData {
  queue: QueueStats;
  recent: RecentItem[];
  throughput: DailyThroughput[];
  timestamp: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) {
    return "—";
  }
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return (
        <Badge
          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          variant="outline"
        >
          <CheckCircle2 /> OK
        </Badge>
      );
    case "failed":
      return (
        <Badge
          className="bg-red-500/10 text-red-600 dark:text-red-400"
          variant="outline"
        >
          <XCircle /> Failed
        </Badge>
      );
    case "deduped":
      return (
        <Badge
          className="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          variant="outline"
        >
          <Copy /> Deduped
        </Badge>
      );
    case "skipped":
      return (
        <Badge variant="secondary">
          <SkipForward /> Skipped
        </Badge>
      );
    default:
      return (
        <Badge
          className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
          variant="outline"
        >
          <Clock /> {status}
        </Badge>
      );
  }
}

export function ProcessingPage() {
  const { data, error, isLoading } = useSWR<MonitoringData>(
    "/api/attachments/monitoring?recent=100",
    fetcher,
    { refreshInterval: 10_000 }
  );

  if (error) {
    return <PageError message="Failed to load monitoring data" />;
  }

  if (isLoading || !data) {
    return <PageLoading />;
  }

  const { queue, recent, throughput } = data;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Processing" }]}
        description="Email attachment extraction pipeline"
        title="Attachment Processing"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          {/* Queue Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Pending" value={queue.pending.toLocaleString()} />
            <StatCard
              accent
              label="Succeeded"
              value={queue.success.toLocaleString()}
            />
            <StatCard label="Failed" value={queue.failed.toLocaleString()} />
            <StatCard label="Deduped" value={queue.deduped.toLocaleString()} />
            <StatCard label="Skipped" value={queue.skipped.toLocaleString()} />
            <StatCard label="Total" value={queue.total.toLocaleString()} />
          </div>

          {/* Daily Throughput */}
          {throughput.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="font-display font-medium text-foreground text-sm">
                  Daily Throughput
                </h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-display font-medium text-foreground">
                      Date
                    </TableHead>
                    <TableHead className="text-right font-display font-medium text-foreground">
                      Succeeded
                    </TableHead>
                    <TableHead className="text-right font-display font-medium text-foreground">
                      Failed
                    </TableHead>
                    <TableHead className="text-right font-display font-medium text-foreground">
                      Deduped
                    </TableHead>
                    <TableHead className="text-right font-display font-medium text-foreground">
                      Skipped
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {throughput.map((day) => (
                    <TableRow key={day.date}>
                      <TableCell className="font-mono text-xs">
                        {day.date}
                      </TableCell>
                      <TableCell className="text-right text-emerald-600 tabular-nums dark:text-emerald-400">
                        {day.succeeded}
                      </TableCell>
                      <TableCell className="text-right text-red-600 tabular-nums dark:text-red-400">
                        {day.failed || "—"}
                      </TableCell>
                      <TableCell className="text-right text-blue-600 tabular-nums dark:text-blue-400">
                        {day.deduped || "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {day.skipped}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Recent Activity */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="font-display font-medium text-foreground text-sm">
                Recent Activity
              </h2>
            </div>
            {recent.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  description="Processed attachments will appear here."
                  title="No activity yet"
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-display font-medium text-foreground">
                      Status
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      File
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Size
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Mailbox
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Subject
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      When
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Error
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <StatusBadge status={item.extraction_status} />
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate font-mono text-xs"
                        title={item.name}
                      >
                        {item.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
                        {formatBytes(item.size)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {item.mailbox_email.split("@")[0]}
                      </TableCell>
                      <TableCell
                        className="max-w-[250px] truncate text-muted-foreground text-xs"
                        title={item.subject ?? ""}
                      >
                        {item.subject ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                        {formatTimeAgo(item.extracted_at)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-red-500 text-xs">
                        {item.extraction_error && (
                          <span
                            className="flex items-center gap-1"
                            title={item.extraction_error}
                          >
                            <FileWarning className="h-3 w-3 shrink-0" />
                            {item.extraction_error}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

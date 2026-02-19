/**
 * Attachment Processing Monitoring API
 *
 * Provides queue stats and recent activity for the attachment backfill pipeline.
 * Route: GET /api/attachments/monitoring
 */
import { db } from "@lib/db/client";

interface QueueStats {
  pending: number;
  processing: number;
  success: number;
  failed: number;
  skipped: number;
  deduped: number;
  total: number;
}

interface RecentActivity {
  id: number;
  name: string;
  email_id: number;
  content_type: string | null;
  size: number | null;
  extraction_status: string;
  extraction_error: string | null;
  extracted_at: string | null;
  last_attempted_at: string | null;
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

const getQueueStats = db.query<{ status: string | null; cnt: number }, []>(`
  SELECT extraction_status as status, COUNT(*)::int as cnt
  FROM documents
  WHERE source = 'email_attachment'
  GROUP BY extraction_status
`);

const getRecentActivity = db.query<RecentActivity, [number]>(`
  SELECT
    d.id, d.file_name as name, d.email_id, d.content_type, d.file_size as size,
    d.extraction_status, d.extraction_error, d.extracted_at,
    d.last_attempted_at, d.content_hash,
    m.email as mailbox_email,
    e.subject, e.from_email, e.project_id
  FROM documents d
  JOIN emails e ON e.id = d.email_id
  JOIN mailboxes m ON m.id = e.mailbox_id
  WHERE d.source = 'email_attachment'
    AND d.extraction_status IS NOT NULL
    AND d.extraction_status NOT IN ('pending')
    AND d.extracted_at IS NOT NULL
  ORDER BY d.extracted_at DESC
  LIMIT $1
`);

const getDailyThroughput = db.query<DailyThroughput, [number]>(`
  SELECT
    extracted_at::date::text as date,
    COUNT(*) FILTER (WHERE extraction_status = 'success')::int as succeeded,
    COUNT(*) FILTER (WHERE extraction_status = 'failed')::int as failed,
    COUNT(*) FILTER (WHERE extraction_status = 'deduped')::int as deduped,
    COUNT(*) FILTER (WHERE extraction_status = 'skipped')::int as skipped
  FROM documents
  WHERE source = 'email_attachment'
    AND extracted_at IS NOT NULL
    AND extracted_at > now() - interval '30 days'
  GROUP BY extracted_at::date
  ORDER BY date DESC
  LIMIT $1
`);

export async function getAttachmentMonitoring(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const recentLimit = Math.min(
    Number(url.searchParams.get("recent") ?? "50"),
    200
  );
  const daysLimit = Math.min(Number(url.searchParams.get("days") ?? "14"), 30);

  const statsRows = await getQueueStats.all();
  const stats: QueueStats = {
    pending: 0,
    processing: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    deduped: 0,
    total: 0,
  };
  for (const row of statsRows) {
    const count = row.cnt;
    stats.total += count;
    switch (row.status) {
      case "pending":
      case null:
        stats.pending += count;
        break;
      case "success":
        stats.success = count;
        break;
      case "failed":
        stats.failed = count;
        break;
      case "skipped":
        stats.skipped = count;
        break;
      case "deduped":
        stats.deduped = count;
        break;
      default:
        break;
    }
  }

  const recent = await getRecentActivity.all(recentLimit);
  const throughput = await getDailyThroughput.all(daysLimit);

  return Response.json({
    queue: stats,
    recent,
    throughput,
    timestamp: new Date().toISOString(),
  });
}

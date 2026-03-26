/**
 * Document Review API
 *
 * Visibility + supervised rerun workspace for processed documents.
 */

import { db, type SqlParam } from "@lib/db/client";
import {
  buildListQuery,
  getReviewDetailRow,
  inferContentType,
  mapDetailRowToResponse,
  type ReviewDetailRow,
  type ReviewListRow,
  type ReviewRerunRequest,
  type ReviewRerunResult,
  type ReviewSaveRequest,
  type ReviewStatsRow,
  readDocumentBuffer,
  rerunDocumentAnalysis,
  safeFilename,
  saveDocumentReview,
} from "@/api/documents/review-helpers";
import {
  formatErrorForLog,
  isApiDbTimeoutError,
  withApiDbTimeout,
} from "@/api/utils/db-guard";

type BunRequest = Request & { params: { id: string } };

export async function listDocumentReview(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const { sql, params } = buildListQuery(url);

    const { items, statsRow } = await withApiDbTimeout(
      {
        operation: "documents.review.list",
        maxInFlight: 6,
        requestId,
        route: "/api/documents/review",
      },
      async () =>
        await db.transaction(async () => {
          const items = await db
            .query<ReviewListRow, SqlParam[]>(sql)
            .all(...params);
          const statsRow = await db
            .query<ReviewStatsRow>(
              `SELECT
                 COUNT(*)::int AS total_documents,
                 COUNT(*) FILTER (WHERE source = 'parsed' AND extraction_status = 'success')::int AS parsed_success,
                 COUNT(*) FILTER (WHERE source = 'email_attachment' AND extraction_status = 'pending')::int AS attachments_pending,
                 COUNT(*) FILTER (WHERE source = 'email_attachment' AND extraction_status = 'failed')::int AS attachments_failed,
                 COUNT(*) FILTER (WHERE raw_extraction IS NOT NULL AND raw_extraction::text <> '{}')::int AS with_raw_extraction,
                 COUNT(*) FILTER (WHERE extracted_text IS NOT NULL AND length(trim(extracted_text)) > 0)::int AS with_extracted_text,
                 COUNT(*) FILTER (WHERE clean_markdown IS NOT NULL AND length(trim(clean_markdown)) > 0)::int AS with_clean_markdown
               FROM documents`
            )
            .get();

          return { items, statsRow };
        })
    );

    return Response.json({
      items,
      requestId,
      stats: statsRow ?? {
        total_documents: 0,
        parsed_success: 0,
        attachments_pending: 0,
        attachments_failed: 0,
        with_raw_extraction: 0,
        with_extracted_text: 0,
        with_clean_markdown: 0,
      },
    });
  } catch (error) {
    console.error("[api.documents.review] failed", {
      requestId,
      route: "/api/documents/review",
      error: formatErrorForLog(error),
    });

    if (isApiDbTimeoutError(error)) {
      return Response.json(
        { error: "Document review query timed out", requestId },
        { status: 503 }
      );
    }

    return Response.json(
      { error: "Failed to fetch document review data", requestId },
      { status: 500 }
    );
  }
}

export async function getDocumentReviewDetail(
  req: BunRequest
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const documentId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return Response.json(
        { error: "Invalid document id", requestId },
        { status: 400 }
      );
    }

    const row = await withApiDbTimeout(
      {
        operation: "documents.review.detail",
        requestId,
        route: "/api/documents/review/:id",
      },
      () => getReviewDetailRow(documentId)
    );

    if (!row) {
      return Response.json(
        { error: "Document not found", requestId },
        { status: 404 }
      );
    }

    return Response.json({ item: mapDetailRowToResponse(row), requestId });
  } catch (error) {
    console.error("[api.documents.review.detail] failed", {
      requestId,
      route: "/api/documents/review/:id",
      error: formatErrorForLog(error),
    });

    if (isApiDbTimeoutError(error)) {
      return Response.json(
        { error: "Document detail query timed out", requestId },
        { status: 503 }
      );
    }

    return Response.json(
      { error: "Failed to fetch document detail", requestId },
      { status: 500 }
    );
  }
}

export async function getDocumentReviewFile(
  req: BunRequest
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const documentId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return Response.json(
        { error: "Invalid document id", requestId },
        { status: 400 }
      );
    }

    const row = await getReviewDetailRow(documentId);
    if (!row) {
      return Response.json(
        { error: "Document not found", requestId },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const inline = url.searchParams.get("inline") === "1";
    const binary = await readDocumentBuffer(row);

    return new Response(new Uint8Array(binary.buffer), {
      headers: {
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeFilename(row.file_name)}"`,
        "Content-Length": binary.buffer.byteLength.toString(),
        "Content-Type": inferContentType(row.content_type, row.file_name),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[api.documents.review.file] failed", {
      requestId,
      route: "/api/documents/review/:id/file",
      error: formatErrorForLog(error),
    });
    return Response.json(
      { error: "Failed to load document file", requestId },
      { status: 500 }
    );
  }
}

export async function updateDocumentReviewState(
  req: BunRequest
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const documentId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return Response.json(
        { error: "Invalid document id", requestId },
        { status: 400 }
      );
    }

    const body = (await req.json()) as ReviewSaveRequest;
    const qaStatus =
      body.qaStatus === "approved" ||
      body.qaStatus === "needs_work" ||
      body.qaStatus === "unreviewed"
        ? body.qaStatus
        : null;

    if (!qaStatus) {
      return Response.json(
        { error: "Invalid review status", requestId },
        { status: 400 }
      );
    }

    const row = await withApiDbTimeout(
      {
        operation: "documents.review.save",
        requestId,
        route: "/api/documents/review/:id/review",
      },
      () => getReviewDetailRow(documentId)
    );

    if (!row) {
      return Response.json(
        { error: "Document not found", requestId },
        { status: 404 }
      );
    }

    await withApiDbTimeout(
      {
        operation: "documents.review.save",
        requestId,
        route: "/api/documents/review/:id/review",
      },
      () =>
        saveDocumentReview(documentId, {
          qaNotes: body.qaNotes?.trim() ? body.qaNotes.trim() : null,
          qaStatus,
        })
    );

    return Response.json({ ok: true, requestId });
  } catch (error) {
    console.error("[api.documents.review.save] failed", {
      requestId,
      route: "/api/documents/review/:id/review",
      error: formatErrorForLog(error),
    });

    if (isApiDbTimeoutError(error)) {
      return Response.json(
        { error: "Saving document review timed out", requestId },
        { status: 503 }
      );
    }

    return Response.json(
      { error: "Failed to save document review", requestId },
      { status: 500 }
    );
  }
}

export async function rerunDocumentReview(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const body = (await req.json()) as ReviewRerunRequest;
    const ids = [
      ...new Set(
        (body.ids ?? []).filter((id) => Number.isInteger(id) && id > 0)
      ),
    ].slice(0, 25) as number[];
    const extractionMode =
      body.extractionMode === "ocr" || body.extractionMode === "full"
        ? body.extractionMode
        : "native";
    const analysisProfile =
      body.analysisProfile === "estimate" || body.analysisProfile === "noi"
        ? body.analysisProfile
        : "auto";

    if (ids.length === 0) {
      return Response.json(
        { error: "At least one document id is required", requestId },
        { status: 400 }
      );
    }

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await db
      .query<ReviewDetailRow, number[]>(
        `SELECT
           d.id,
           d.source,
           d.file_name,
           d.file_path,
           d.local_path,
           d.storage_path,
           d.outlook_attachment_id,
           d.document_type,
           d.summary,
           d.model,
           d.processing_time_ms,
           d.extraction_status,
           d.extraction_error,
           d.extracted_text,
           d.clean_markdown,
           d.extraction_method,
           d.page_count,
           d.extraction_attempts,
           d.extracted_at,
           d.created_at,
           d.updated_at,
           d.project_id,
           d.email_id,
           d.content_type,
           d.file_size,
           d.original_from,
           d.original_subject,
           d.forwarder_email,
           d.extraction_metadata::text AS extraction_metadata_json,
           d.raw_extraction::text AS raw_extraction_json,
           d.qa_notes,
           COALESCE(d.qa_status, 'unreviewed') AS qa_status,
           d.reviewed_at,
           d.sharepoint_path,
           d.sharepoint_url,
           p.name AS project_name,
           e.subject AS email_subject,
           e.from_email,
           e.message_id,
           m.email AS mailbox_email
         FROM documents d
         LEFT JOIN projects p ON p.id = d.project_id
         LEFT JOIN emails e ON e.id = d.email_id
         LEFT JOIN mailboxes m ON m.id = e.mailbox_id
         WHERE d.id IN (${placeholders})`
      )
      .all(...ids);

    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const results: ReviewRerunResult[] = [];

    for (const id of ids) {
      const row = rowMap.get(id);
      if (!row) {
        results.push({
          documentType: null,
          error: "Document not found",
          id,
          status: "failed",
          summary: null,
        });
        continue;
      }

      if (row.source !== "parsed") {
        results.push({
          documentType: row.document_type,
          error: "Only parsed documents can be rerun from this workspace",
          id,
          status: "failed",
          summary: row.summary,
        });
        continue;
      }

      try {
        results.push(
          await rerunDocumentAnalysis(row, extractionMode, analysisProfile)
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          documentType: row.document_type,
          error: message,
          id,
          status: "failed",
          summary: row.summary,
        });
      }
    }

    return Response.json({
      analysisProfile,
      extractionMode,
      failed: results.filter((result) => result.status === "failed").length,
      requestId,
      results,
      succeeded: results.filter((result) => result.status === "success").length,
    });
  } catch (error) {
    console.error("[api.documents.review.rerun] failed", {
      requestId,
      route: "/api/documents/review/rerun",
      error: formatErrorForLog(error),
    });
    return Response.json(
      { error: "Failed to rerun document analysis", requestId },
      { status: 500 }
    );
  }
}

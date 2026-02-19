/**
 * Upload API handlers
 * Routes: GET/POST /api/upload/pdf
 */

import { db } from "@lib/db/client";
import { createSharePointClientFromEnv } from "@sharepoint/intake-upload";
import {
  buildTakeoffSharePointPath,
  decodeSharePointPdfPath,
  encodeSharePointPdfUrl,
  isExternalPdfUrl,
  normalizeTakeoffPdfFileName,
} from "../lib/takeoff-pdf-storage";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

interface TakeoffPdfRow {
  id: string;
  pdf_url: string | null;
}

const getTakeoffPdfRow = db.query<TakeoffPdfRow>(
  "SELECT id, pdf_url FROM takeoffs WHERE id = $1"
);

// POST /api/upload/pdf - Upload a PDF for a takeoff
export async function uploadPdf(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const takeoffId = formData.get("takeoffId") as string | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!takeoffId) {
      return Response.json({ error: "No takeoffId provided" }, { status: 400 });
    }

    const takeoff = await getTakeoffPdfRow.get(takeoffId);
    if (!takeoff) {
      return Response.json(
        { error: "Takeoff not found", takeoffId },
        { status: 404 }
      );
    }

    const isPdfType =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdfType) {
      return Response.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "File size exceeds 100MB limit" },
        { status: 400 }
      );
    }

    const sharePointClient = createSharePointClientFromEnv();
    if (!sharePointClient) {
      return Response.json(
        { error: "SharePoint client not configured" },
        { status: 500 }
      );
    }

    const requestedFileName =
      (formData.get("filename") as string | null) ?? file.name;
    const fileName = normalizeTakeoffPdfFileName(requestedFileName);
    const sharePointPath = buildTakeoffSharePointPath(takeoffId, fileName);

    const lastSlash = sharePointPath.lastIndexOf("/");
    const folderPath =
      lastSlash === -1 ? "" : sharePointPath.slice(0, lastSlash);

    if (!folderPath) {
      return Response.json(
        { error: "Invalid SharePoint folder path" },
        { status: 500 }
      );
    }

    await sharePointClient.ensureFolder(folderPath);

    const content = Buffer.from(await file.arrayBuffer());
    const uploaded = await sharePointClient.upload(
      folderPath,
      fileName,
      content
    );

    const pdfUrl = encodeSharePointPdfUrl(sharePointPath);

    await db
      .query(
        "UPDATE takeoffs SET pdf_url = $1, updated_at = now() WHERE id = $2"
      )
      .run(pdfUrl, takeoffId);

    return Response.json({
      takeoffId,
      filename: sharePointPath,
      pdfUrl,
      webUrl: uploaded.webUrl,
    });
  } catch (error) {
    console.error("Failed to upload PDF:", error);
    return Response.json(
      {
        error: "Failed to upload PDF",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET /api/upload/pdf - Check if a PDF exists
export async function checkPdfExists(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const takeoffId = searchParams.get("takeoffId");

    if (!takeoffId) {
      return Response.json({ error: "No takeoffId provided" }, { status: 400 });
    }

    const takeoff = await getTakeoffPdfRow.get(takeoffId);
    if (!takeoff?.pdf_url) {
      return Response.json({
        exists: false,
        takeoffId,
        filename: null,
      });
    }

    if (isExternalPdfUrl(takeoff.pdf_url)) {
      return Response.json({
        exists: true,
        takeoffId,
        filename: null,
        pdfUrl: takeoff.pdf_url,
      });
    }

    const sharePointPath = decodeSharePointPdfPath(takeoff.pdf_url);
    if (!sharePointPath) {
      return Response.json({
        exists: false,
        takeoffId,
        filename: null,
      });
    }

    const sharePointClient = createSharePointClientFromEnv();
    if (!sharePointClient) {
      return Response.json(
        {
          exists: false,
          takeoffId,
          filename: sharePointPath,
          error: "SharePoint client not configured",
        },
        { status: 503 }
      );
    }

    const exists = await sharePointClient.exists(sharePointPath);

    return Response.json({
      exists,
      takeoffId,
      filename: sharePointPath,
      pdfUrl: takeoff.pdf_url,
    });
  } catch (error) {
    console.error("Failed to check PDF:", error);
    return Response.json(
      { error: "Failed to check PDF existence" },
      { status: 500 }
    );
  }
}

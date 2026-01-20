/**
 * Upload API handlers
 * Routes: GET/POST /api/upload/pdf
 */
import {
  BUCKETS,
  fileExists,
  setFileTags,
  uploadTakeoffPdf,
} from "../../lib/minio";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// POST /api/upload/pdf - Upload a PDF for a takeoff
export async function uploadPdf(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const takeoffId = formData.get("takeoffId") as string | null;
    const filename = formData.get("filename") as string | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!takeoffId) {
      return Response.json({ error: "No takeoffId provided" }, { status: 400 });
    }

    // Validate file type
    if (file.type !== "application/pdf") {
      return Response.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "File size exceeds 100MB limit" },
        { status: 400 }
      );
    }

    // Convert file to Uint8Array (web-standard, no Buffer.from() needed)
    const bytes = new Uint8Array(await file.arrayBuffer());

    // Upload to MinIO
    const objectFilename = filename || file.name || "original.pdf";
    const { url, size } = await uploadTakeoffPdf(
      takeoffId,
      bytes,
      objectFilename
    );

    // Set metadata tags
    const objectName = `${takeoffId}/${objectFilename}`;
    await setFileTags(BUCKETS.TAKEOFFS, objectName, {
      takeoff_id: takeoffId,
      original_name: file.name,
      original_size: String(file.size),
      upload_time: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      url,
      size,
      filename: objectFilename,
      takeoffId,
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
    const filename = searchParams.get("filename") || "original.pdf";

    if (!takeoffId) {
      return Response.json({ error: "No takeoffId provided" }, { status: 400 });
    }

    const objectName = `${takeoffId}/${filename}`;
    const exists = await fileExists(BUCKETS.TAKEOFFS, objectName);

    return Response.json({ exists, takeoffId, filename });
  } catch (error) {
    console.error("Failed to check PDF:", error);
    return Response.json(
      { error: "Failed to check PDF existence" },
      { status: 500 }
    );
  }
}

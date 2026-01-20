import { NextResponse } from "next/server";
import {
  BUCKETS,
  fileExists,
  setFileTags,
  uploadTakeoffPdf,
} from "@/lib/minio";

export const runtime = "nodejs";

// Max file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const takeoffId = formData.get("takeoffId") as string | null;
    const filename = formData.get("filename") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!takeoffId) {
      return NextResponse.json(
        { error: "No takeoffId provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 100MB limit" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to MinIO AIStor
    const objectFilename = filename || file.name || "original.pdf";
    const { url, size } = await uploadTakeoffPdf(
      takeoffId,
      buffer,
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

    return NextResponse.json({
      success: true,
      url,
      size,
      filename: objectFilename,
      takeoffId,
    });
  } catch (error) {
    console.error("Failed to upload PDF:", error);
    return NextResponse.json(
      {
        error: "Failed to upload PDF",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET: Check if a PDF exists for a takeoff
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const takeoffId = searchParams.get("takeoffId");
    const filename = searchParams.get("filename") || "original.pdf";

    if (!takeoffId) {
      return NextResponse.json(
        { error: "No takeoffId provided" },
        { status: 400 }
      );
    }

    const objectName = `${takeoffId}/${filename}`;
    const exists = await fileExists(BUCKETS.TAKEOFFS, objectName);

    return NextResponse.json({ exists, takeoffId, filename });
  } catch (error) {
    console.error("Failed to check PDF:", error);
    return NextResponse.json(
      { error: "Failed to check PDF existence" },
      { status: 500 }
    );
  }
}

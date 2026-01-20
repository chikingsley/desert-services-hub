import { NextResponse } from "next/server";
import {
  BUCKETS,
  fileExists,
  getFileStream,
  getFileTags,
  getTakeoffPdfUrl,
} from "@/lib/minio";

export const runtime = "nodejs";

// GET: Get presigned URL or stream PDF for a takeoff
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename") || "original.pdf";
    const mode = searchParams.get("mode") || "url"; // "url" or "stream"

    const objectName = `${id}/${filename}`;

    // Check if file exists
    const exists = await fileExists(BUCKETS.TAKEOFFS, objectName);
    if (!exists) {
      return NextResponse.json(
        { error: "PDF not found", takeoffId: id },
        { status: 404 }
      );
    }

    if (mode === "stream") {
      // Stream the file directly
      const stream = await getFileStream(BUCKETS.TAKEOFFS, objectName);

      // Convert Node stream to Web ReadableStream
      const webStream = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          stream.on("end", () => {
            controller.close();
          });
          stream.on("error", (err: Error) => {
            controller.error(err);
          });
        },
      });

      return new Response(webStream, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    // Default: return presigned URL (valid for 1 hour)
    const url = await getTakeoffPdfUrl(id, filename, 3600);

    // Also get metadata if available
    let tags: Record<string, string> = {};
    try {
      tags = await getFileTags(BUCKETS.TAKEOFFS, objectName);
    } catch {
      // Tags might not exist
    }

    return NextResponse.json({
      url,
      takeoffId: id,
      filename,
      expiresIn: 3600,
      metadata: tags,
    });
  } catch (error) {
    console.error("Failed to get PDF:", error);
    return NextResponse.json(
      {
        error: "Failed to get PDF",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

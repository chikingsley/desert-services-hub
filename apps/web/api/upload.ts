/**
 * Upload API handlers
 * Routes: GET/POST /api/upload/pdf
 *
 * File storage migrated to SharePoint. Upload endpoint preserved
 * for future local/SharePoint upload integration.
 */

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

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

    if (file.type !== "application/pdf") {
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

    return Response.json(
      { error: "File upload not available — storage migrated to SharePoint" },
      { status: 501 }
    );
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
export function checkPdfExists(req: Request): Response {
  try {
    const { searchParams } = new URL(req.url);
    const takeoffId = searchParams.get("takeoffId");

    if (!takeoffId) {
      return Response.json({ error: "No takeoffId provided" }, { status: 400 });
    }

    return Response.json({
      exists: false,
      takeoffId,
      filename: "original.pdf",
    });
  } catch (error) {
    console.error("Failed to check PDF:", error);
    return Response.json(
      { error: "Failed to check PDF existence" },
      { status: 500 }
    );
  }
}

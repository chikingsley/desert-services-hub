import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generatePDF, getPDFFilename } from "@/lib/pdf/generate-pdf";
import type {
  EditorLineItem,
  EditorQuote,
  EditorSection,
  QuoteLineItemRow,
  QuoteRow,
  QuoteSectionRow,
  QuoteVersionRow,
} from "@/lib/types";

// GET /api/quotes/[id]/pdf - Generate and download PDF for a quote
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch quote from database
    const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as
      | QuoteRow
      | undefined;

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    // Get current version
    const version = db
      .prepare(
        "SELECT * FROM quote_versions WHERE quote_id = ? AND is_current = 1"
      )
      .get(id) as QuoteVersionRow | undefined;

    if (!version) {
      return NextResponse.json(
        { error: "No current version found" },
        { status: 404 }
      );
    }

    // Get sections
    const sectionsData = db
      .prepare(
        "SELECT * FROM quote_sections WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id) as QuoteSectionRow[];

    // Get line items
    const lineItemsData = db
      .prepare(
        "SELECT * FROM quote_line_items WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id) as QuoteLineItemRow[];

    // Convert to EditorQuote format
    const sections: EditorSection[] = sectionsData.map((s) => ({
      id: s.id,
      name: s.name,
    }));

    const lineItems: EditorLineItem[] = lineItemsData.map((item) => ({
      id: item.id,
      item: item.description,
      description: item.notes || "",
      qty: item.quantity,
      uom: item.unit,
      cost: item.unit_price,
      total: item.quantity * item.unit_price,
      sectionId: item.section_id || undefined,
      isStruck: item.is_excluded === 1,
    }));

    const total = lineItems
      .filter((item) => !item.isStruck)
      .reduce((sum, item) => sum + item.total, 0);

    const editorQuote: EditorQuote = {
      estimateNumber: quote.base_number,
      date: quote.created_at || new Date().toISOString(),
      estimator: "", // Could be stored in quote row in the future
      estimatorEmail: "",
      billTo: {
        companyName: quote.client_name || "",
        address: "",
        email: quote.client_email || "",
        phone: quote.client_phone || "",
      },
      jobInfo: {
        siteName: quote.job_name || "",
        address: quote.job_address || "",
      },
      sections,
      lineItems,
      total,
    };

    // Generate PDF
    const pdfBuffer = await generatePDF(editorQuote);

    // Generate filename
    const filename = getPDFFilename(editorQuote);

    // Return PDF as downloadable response
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}

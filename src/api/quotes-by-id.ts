/**
 * Quote by ID API handlers
 * Routes: /api/quotes/:id, /api/quotes/:id/pdf, /api/quotes/:id/duplicate, /api/quotes/:id/takeoff
 */
import { db } from "../../lib/db";
import { generatePDF, getPDFFilename } from "../../lib/pdf/generate-pdf";
import type {
  EditorLineItem,
  EditorQuote,
  EditorSection,
  QuoteLineItemRow,
  QuoteRow,
  QuoteSection,
  QuoteSectionRow,
  QuoteVersionRow,
} from "../../lib/types";
import { generateBaseNumber } from "../../lib/utils";

// Bun request type with params
type BunRequest = Request & { params: { id: string } };

interface QuoteLineItemInput {
  section_id?: string;
  description?: string;
  item?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  uom?: string;
  unit_cost?: number;
  cost?: number;
  unit_price?: number;
  notes?: string;
}

// Generate a unique base number (YYMMDD format with suffix for duplicates)
function getNextBaseNumber(): string {
  const baseNumber = generateBaseNumber();

  const existing = db
    .prepare(
      `SELECT base_number FROM quotes
       WHERE base_number LIKE ?
       ORDER BY base_number DESC
       LIMIT 1`
    )
    .get(`${baseNumber}%`) as { base_number: string } | undefined;

  if (!existing) {
    return baseNumber;
  }

  const lastNumber = existing.base_number;
  if (lastNumber.length > 6) {
    const suffix = Number.parseInt(lastNumber.slice(6), 10) + 1;
    return `${baseNumber}${suffix.toString().padStart(2, "0")}`;
  }
  return `${baseNumber}01`;
}

// GET /api/quotes/:id - Get a single quote with versions, sections, line items
export function getQuote(req: BunRequest): Response {
  try {
    const { id } = req.params;

    const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as
      | QuoteRow
      | undefined;

    if (!quote) {
      return Response.json({ error: "Quote not found" }, { status: 404 });
    }

    const version = db
      .prepare(
        "SELECT * FROM quote_versions WHERE quote_id = ? AND is_current = 1"
      )
      .get(id) as QuoteVersionRow | undefined;

    if (!version) {
      return Response.json(
        { error: "No current version found" },
        { status: 404 }
      );
    }

    const sections = db
      .prepare(
        "SELECT * FROM quote_sections WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id) as QuoteSectionRow[];

    const lineItems = db
      .prepare(
        "SELECT * FROM quote_line_items WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id) as QuoteLineItemRow[];

    return Response.json({
      ...quote,
      current_version: {
        ...version,
        sections,
        line_items: lineItems,
      },
    });
  } catch (error) {
    console.error("Failed to fetch quote:", error);
    return Response.json({ error: "Failed to fetch quote" }, { status: 500 });
  }
}

// PUT /api/quotes/:id - Update a quote
export async function updateQuote(req: BunRequest): Promise<Response> {
  try {
    const { id } = req.params;
    const body = await req.json();

    // Update quote metadata
    const updateFields = [
      "base_number = ?",
      "job_name = ?",
      "job_address = ?",
      "client_name = ?",
      "client_email = ?",
      "client_phone = ?",
      "notes = ?",
      "status = ?",
      "updated_at = datetime('now')",
    ];
    const updateValues: (string | null)[] = [
      body.base_number,
      body.job_name || "Untitled Quote",
      body.job_address || null,
      body.client_name || null,
      body.client_email || null,
      body.client_phone || null,
      body.notes || null,
      body.status || "draft",
    ];

    // Only update takeoff_id if explicitly provided
    if ("takeoff_id" in body) {
      updateFields.push("takeoff_id = ?");
      updateValues.push(body.takeoff_id || null);
    }

    updateValues.push(id);

    db.prepare(`UPDATE quotes SET ${updateFields.join(", ")} WHERE id = ?`).run(
      ...updateValues
    );

    // Get current version
    const version = db
      .prepare(
        "SELECT id FROM quote_versions WHERE quote_id = ? AND is_current = 1"
      )
      .get(id) as { id: string } | undefined;

    if (version) {
      // Delete existing sections and line items
      db.prepare("DELETE FROM quote_line_items WHERE version_id = ?").run(
        version.id
      );
      db.prepare("DELETE FROM quote_sections WHERE version_id = ?").run(
        version.id
      );

      // Re-create sections
      const sectionIdMap = new Map<string, string>();
      const sections = body.sections as QuoteSection[] | undefined;
      if (sections) {
        let sortOrder = 0;
        for (const section of sections) {
          const sectionId = crypto.randomUUID();
          db.prepare(
            `INSERT INTO quote_sections (id, version_id, name, title, show_subtotal, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(
            sectionId,
            version.id,
            section.name,
            section.title ?? null,
            section.show_subtotal ? 1 : 0,
            sortOrder
          );
          sectionIdMap.set(section.id, sectionId);
          sortOrder += 1;
        }
      }

      // Re-create line items
      const lineItems = body.line_items as QuoteLineItemInput[] | undefined;
      if (lineItems) {
        let sortOrder = 0;
        for (const item of lineItems) {
          const lineItemId = crypto.randomUUID();
          const cost = item.cost ?? 0;
          db.prepare(
            `INSERT INTO quote_line_items (id, version_id, section_id, description, quantity, unit, unit_cost, unit_price, notes, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            lineItemId,
            version.id,
            item.section_id
              ? (sectionIdMap.get(item.section_id) ?? null)
              : null,
            item.item || item.description || "",
            item.quantity ?? item.qty ?? 1,
            item.unit || item.uom || "EA",
            item.unit_cost ?? cost * 0.7,
            item.unit_price ?? cost,
            item.notes ||
              (item.item && item.description && item.item !== item.description
                ? item.description
                : null) ||
              null,
            sortOrder
          );
          sortOrder += 1;
        }
      }

      // Update version total
      db.prepare("UPDATE quote_versions SET total = ? WHERE id = ?").run(
        body.total || 0,
        version.id
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update quote:", error);
    return Response.json({ error: "Failed to update quote" }, { status: 500 });
  }
}

// DELETE /api/quotes/:id - Delete a quote
export function deleteQuote(req: BunRequest): Response {
  try {
    const { id } = req.params;

    const quote = db.prepare("SELECT id FROM quotes WHERE id = ?").get(id);

    if (!quote) {
      return Response.json({ error: "Quote not found" }, { status: 404 });
    }

    db.prepare("DELETE FROM quotes WHERE id = ?").run(id);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete quote:", error);
    return Response.json({ error: "Failed to delete quote" }, { status: 500 });
  }
}

// GET /api/quotes/:id/pdf - Generate and download PDF
export async function getQuotePdf(req: BunRequest): Promise<Response> {
  try {
    const { id } = req.params;

    const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as
      | QuoteRow
      | undefined;

    if (!quote) {
      return Response.json({ error: "Quote not found" }, { status: 404 });
    }

    const version = db
      .prepare(
        "SELECT * FROM quote_versions WHERE quote_id = ? AND is_current = 1"
      )
      .get(id) as QuoteVersionRow | undefined;

    if (!version) {
      return Response.json(
        { error: "No current version found" },
        { status: 404 }
      );
    }

    const sectionsData = db
      .prepare(
        "SELECT * FROM quote_sections WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id) as QuoteSectionRow[];

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
    }));

    const total = lineItems.reduce((sum, item) => sum + item.total, 0);

    const editorQuote: EditorQuote = {
      estimateNumber: quote.base_number,
      date: quote.created_at || new Date().toISOString(),
      estimator: "",
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

    const pdfBytes = await generatePDF(editorQuote);
    const filename = getPDFFilename(editorQuote);

    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}

// POST /api/quotes/:id/duplicate - Duplicate a quote
export function duplicateQuote(req: BunRequest): Response {
  try {
    const { id } = req.params;

    const originalQuote = db
      .prepare("SELECT * FROM quotes WHERE id = ?")
      .get(id) as QuoteRow | undefined;

    if (!originalQuote) {
      return Response.json({ error: "Quote not found" }, { status: 404 });
    }

    const originalVersion = db
      .prepare(
        "SELECT * FROM quote_versions WHERE quote_id = ? AND is_current = 1"
      )
      .get(id) as QuoteVersionRow | undefined;

    if (!originalVersion) {
      return Response.json(
        { error: "No current version found" },
        { status: 404 }
      );
    }

    const originalSections = db
      .prepare(
        "SELECT * FROM quote_sections WHERE version_id = ? ORDER BY sort_order"
      )
      .all(originalVersion.id) as QuoteSectionRow[];

    const originalLineItems = db
      .prepare(
        "SELECT * FROM quote_line_items WHERE version_id = ? ORDER BY sort_order"
      )
      .all(originalVersion.id) as QuoteLineItemRow[];

    // Create new quote
    const newQuoteId = crypto.randomUUID();
    const newBaseNumber = getNextBaseNumber();

    db.prepare(
      `INSERT INTO quotes (id, base_number, takeoff_id, job_name, job_address, client_name, client_email, client_phone, notes, status, is_locked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newQuoteId,
      newBaseNumber,
      originalQuote.takeoff_id,
      `${originalQuote.job_name} (Copy)`,
      originalQuote.job_address,
      originalQuote.client_name,
      originalQuote.client_email,
      originalQuote.client_phone,
      originalQuote.notes,
      "draft",
      0
    );

    // Create new version
    const newVersionId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO quote_versions (id, quote_id, version_number, total, is_current)
       VALUES (?, ?, 1, ?, 1)`
    ).run(newVersionId, newQuoteId, originalVersion.total);

    // Copy sections
    const sectionIdMap = new Map<string, string>();
    for (const section of originalSections) {
      const newSectionId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO quote_sections (id, version_id, name, title, show_subtotal, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        newSectionId,
        newVersionId,
        section.name,
        section.title,
        section.show_subtotal,
        section.sort_order
      );
      sectionIdMap.set(section.id, newSectionId);
    }

    // Copy line items
    for (const item of originalLineItems) {
      const newLineItemId = crypto.randomUUID();
      const newSectionId = item.section_id
        ? (sectionIdMap.get(item.section_id) ?? null)
        : null;

      db.prepare(
        `INSERT INTO quote_line_items (id, version_id, section_id, description, quantity, unit, unit_cost, unit_price, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newLineItemId,
        newVersionId,
        newSectionId,
        item.description,
        item.quantity,
        item.unit,
        item.unit_cost,
        item.unit_price,
        item.notes,
        item.sort_order
      );
    }

    return Response.json({
      id: newQuoteId,
      base_number: newBaseNumber,
    });
  } catch (error) {
    console.error("Failed to duplicate quote:", error);
    return Response.json(
      { error: "Failed to duplicate quote" },
      { status: 500 }
    );
  }
}

// GET /api/quotes/:id/takeoff - Get linked takeoff
export function getQuoteTakeoff(req: BunRequest): Response {
  try {
    const { id } = req.params;

    const quote = db
      .prepare("SELECT takeoff_id FROM quotes WHERE id = ?")
      .get(id) as { takeoff_id: string | null } | undefined;

    if (!quote?.takeoff_id) {
      return Response.json({ takeoff: null });
    }

    const takeoff = db
      .prepare(
        `SELECT id, name, status, created_at, updated_at
         FROM takeoffs
         WHERE id = ?`
      )
      .get(quote.takeoff_id) as
      | {
          id: string;
          name: string;
          status: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!takeoff) {
      return Response.json({ takeoff: null });
    }

    return Response.json({ takeoff });
  } catch (error) {
    console.error("Failed to get linked takeoff:", error);
    return Response.json(
      { error: "Failed to get linked takeoff" },
      { status: 500 }
    );
  }
}

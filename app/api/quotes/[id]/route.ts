import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type {
  QuoteLineItemRow,
  QuoteRow,
  QuoteSectionRow,
  QuoteVersionRow,
} from "@/lib/types";

interface QuoteSection {
  id: string;
  name: string;
}

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
  is_excluded?: boolean;
  isStruck?: boolean;
  notes?: string;
}

// GET /api/quotes/[id] - Get a single quote with versions, sections, line items
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get quote
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
    const sections = db
      .prepare(
        "SELECT * FROM quote_sections WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id) as QuoteSectionRow[];

    // Get line items
    const lineItems = db
      .prepare(
        "SELECT * FROM quote_line_items WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id) as QuoteLineItemRow[];

    return NextResponse.json({
      ...quote,
      current_version: {
        ...version,
        sections,
        line_items: lineItems,
      },
    });
  } catch (error) {
    console.error("Failed to fetch quote:", error);
    return NextResponse.json(
      { error: "Failed to fetch quote" },
      { status: 500 }
    );
  }
}

// DELETE /api/quotes/[id] - Delete a quote
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if quote exists
    const quote = db.prepare("SELECT id FROM quotes WHERE id = ?").get(id);

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    // Delete quote (cascade will handle versions, sections, line items)
    db.prepare("DELETE FROM quotes WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete quote:", error);
    return NextResponse.json(
      { error: "Failed to delete quote" },
      { status: 500 }
    );
  }
}

// PUT /api/quotes/[id] - Update a quote
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Update quote metadata (takeoff_id only updated if explicitly provided)
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

    // Only update takeoff_id if explicitly provided in the request
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
      if (sections && sections.length > 0) {
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          const sectionId = crypto.randomUUID();
          db.prepare(
            `INSERT INTO quote_sections (id, version_id, name, sort_order)
             VALUES (?, ?, ?, ?)`
          ).run(sectionId, version.id, section.name, i);
          sectionIdMap.set(section.id, sectionId);
        }
      }

      // Re-create line items
      const lineItems = body.line_items as QuoteLineItemInput[] | undefined;
      if (lineItems && lineItems.length > 0) {
        for (let i = 0; i < lineItems.length; i++) {
          const item = lineItems[i];
          const lineItemId = crypto.randomUUID();
          const cost = item.cost ?? 0;
          db.prepare(
            `INSERT INTO quote_line_items (id, version_id, section_id, description, quantity, unit, unit_cost, unit_price, is_excluded, notes, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            lineItemId,
            version.id,
            item.section_id
              ? (sectionIdMap.get(item.section_id) ?? null)
              : null,
            item.description || item.item || "",
            item.quantity ?? item.qty ?? 1,
            item.unit || item.uom || "EA",
            item.unit_cost ?? cost * 0.7,
            item.unit_price ?? cost,
            item.is_excluded || item.isStruck ? 1 : 0,
            item.notes || item.description || null,
            i
          );
        }
      }

      // Update version total
      db.prepare("UPDATE quote_versions SET total = ? WHERE id = ?").run(
        body.total || 0,
        version.id
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update quote:", error);
    return NextResponse.json(
      { error: "Failed to update quote" },
      { status: 500 }
    );
  }
}

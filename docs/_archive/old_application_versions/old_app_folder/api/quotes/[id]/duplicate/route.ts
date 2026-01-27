import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type {
  QuoteLineItemRow,
  QuoteRow,
  QuoteSectionRow,
  QuoteVersionRow,
} from "@/lib/types";
import { generateBaseNumber } from "@/lib/utils";

// Generate a unique base number (YYMMDD format with suffix for duplicates)
function getNextBaseNumber(): string {
  const baseNumber = generateBaseNumber();

  // Check for existing quotes with this prefix
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

  // Add suffix for duplicates (01, 02, etc.)
  const lastNumber = existing.base_number;
  if (lastNumber.length > 6) {
    const suffix = Number.parseInt(lastNumber.slice(6), 10) + 1;
    return `${baseNumber}${suffix.toString().padStart(2, "0")}`;
  }
  return `${baseNumber}01`;
}

// POST /api/quotes/[id]/duplicate - Duplicate a quote
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get original quote
    const originalQuote = db
      .prepare("SELECT * FROM quotes WHERE id = ?")
      .get(id) as QuoteRow | undefined;

    if (!originalQuote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    // Get current version
    const originalVersion = db
      .prepare(
        "SELECT * FROM quote_versions WHERE quote_id = ? AND is_current = 1"
      )
      .get(id) as QuoteVersionRow | undefined;

    if (!originalVersion) {
      return NextResponse.json(
        { error: "No current version found" },
        { status: 404 }
      );
    }

    // Get sections
    const originalSections = db
      .prepare(
        "SELECT * FROM quote_sections WHERE version_id = ? ORDER BY sort_order"
      )
      .all(originalVersion.id) as QuoteSectionRow[];

    // Get line items
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
      "draft", // Always start as draft
      0 // Not locked
    );

    // Create new version
    const newVersionId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO quote_versions (id, quote_id, version_number, total, is_current)
       VALUES (?, ?, 1, ?, 1)`
    ).run(newVersionId, newQuoteId, originalVersion.total);

    // Create section ID mapping for line items
    const sectionIdMap = new Map<string, string>();

    // Copy sections
    for (const section of originalSections) {
      const newSectionId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO quote_sections (id, version_id, name, sort_order)
         VALUES (?, ?, ?, ?)`
      ).run(newSectionId, newVersionId, section.name, section.sort_order);
      sectionIdMap.set(section.id, newSectionId);
    }

    // Copy line items
    for (const item of originalLineItems) {
      const newLineItemId = crypto.randomUUID();
      const newSectionId = item.section_id
        ? (sectionIdMap.get(item.section_id) ?? null)
        : null;

      db.prepare(
        `INSERT INTO quote_line_items (id, version_id, section_id, description, quantity, unit, unit_cost, unit_price, is_excluded, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newLineItemId,
        newVersionId,
        newSectionId,
        item.description,
        item.quantity,
        item.unit,
        item.unit_cost,
        item.unit_price,
        item.is_excluded,
        item.notes,
        item.sort_order
      );
    }

    return NextResponse.json({
      id: newQuoteId,
      base_number: newBaseNumber,
    });
  } catch (error) {
    console.error("Failed to duplicate quote:", error);
    return NextResponse.json(
      { error: "Failed to duplicate quote" },
      { status: 500 }
    );
  }
}

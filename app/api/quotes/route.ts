import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { QuoteRow } from "@/lib/types";
import { generateBaseNumber } from "@/lib/utils";

interface QuoteWithVersionsJson extends QuoteRow {
  versions: string;
}

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

// GET /api/quotes - List all quotes
export function GET() {
  try {
    const quotes = db
      .prepare(
        `SELECT q.*, 
          (SELECT json_group_array(json_object(
            'id', v.id,
            'version_number', v.version_number,
            'total', v.total,
            'is_current', v.is_current,
            'created_at', v.created_at
          )) FROM quote_versions v WHERE v.quote_id = q.id) as versions
        FROM quotes q
        ORDER BY q.created_at DESC`
      )
      .all() as QuoteWithVersionsJson[];

    // Parse the versions JSON for each quote
    const parsedQuotes = quotes.map((q) => ({
      ...q,
      versions: JSON.parse(q.versions || "[]"),
    }));

    return NextResponse.json(parsedQuotes);
  } catch (error) {
    console.error("Failed to fetch quotes:", error);
    return NextResponse.json(
      { error: "Failed to fetch quotes" },
      { status: 500 }
    );
  }
}

// POST /api/quotes - Create a new quote
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = crypto.randomUUID();

    // Auto-generate base_number if not provided (YYMMDD format)
    const baseNumber = body.base_number || getNextBaseNumber();

    // Insert quote
    db.prepare(
      `INSERT INTO quotes (id, base_number, takeoff_id, job_name, job_address, client_name, client_email, client_phone, notes, status, is_locked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      baseNumber,
      body.takeoff_id || null,
      body.job_name || "Untitled Quote",
      body.job_address || null,
      body.client_name || null,
      body.client_email || null,
      body.client_phone || null,
      body.notes || null,
      body.status || "draft",
      body.is_locked ? 1 : 0
    );

    // Create first version
    const versionId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO quote_versions (id, quote_id, version_number, total, is_current)
       VALUES (?, ?, 1, ?, 1)`
    ).run(versionId, id, body.total || 0);

    // Create sections if provided
    const sectionIdMap = new Map<string, string>();
    const sections = body.sections as QuoteSection[] | undefined;
    if (sections && sections.length > 0) {
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const sectionId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO quote_sections (id, version_id, name, sort_order)
           VALUES (?, ?, ?, ?)`
        ).run(sectionId, versionId, section.name, i);
        sectionIdMap.set(section.id, sectionId);
      }
    }

    // Create line items if provided
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
          versionId,
          item.section_id ? (sectionIdMap.get(item.section_id) ?? null) : null,
          item.item || item.description || "",
          item.quantity ?? item.qty ?? 1,
          item.unit || item.uom || "EA",
          item.unit_cost ?? cost * 0.7,
          item.unit_price ?? cost,
          item.is_excluded || item.isStruck ? 1 : 0,
          item.notes ||
            (item.item && item.description && item.item !== item.description
              ? item.description
              : null) ||
            null,
          i
        );
      }
    }

    return NextResponse.json({ id, version_id: versionId });
  } catch (error) {
    console.error("Failed to create quote:", error);
    return NextResponse.json(
      { error: "Failed to create quote" },
      { status: 500 }
    );
  }
}

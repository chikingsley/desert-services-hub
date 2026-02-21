/**
 * Generic Oracle ADF detail page parser.
 *
 * All AQData portal detail pages (settlements, enforcement actions, complaints,
 * site visits, invoices, asbestos notifications) share the same DOM structure:
 *
 * - Label/value pairs in `<tr>` rows with `<label>` tags
 * - Data tables with `<th>` headers and `<td>` cells (class x2d)
 * - Attachment tables in a document tab section
 * - Collapsible sections with `<h2 class="x1y">` headers
 *
 * This parser extracts all of them generically, returning a structured object
 * that downstream code can use without knowing the specific page layout.
 */

import type { CheerioAPI } from "cheerio";
import { load } from "cheerio";
import type { AnyNode } from "domhandler";
import { BASE_URL } from "../constants";

export interface DetailAttachment {
  attachmentId: string;
  attachmentType: string;
  description: string;
  uploadDate: string;
  uploadedBy: string;
  url: string;
}

export interface DetailTable {
  headers: string[];
  name: string;
  rows: Record<string, string>[];
}

export interface DetailCoordinates {
  latitude: number;
  longitude: number;
}

export interface PortalDetailPage {
  attachments: DetailAttachment[];
  coordinates: DetailCoordinates | null;
  fields: Record<string, string>;
  rawHtml: string;
  recordId: string;
  tables: DetailTable[];
}

const WHITESPACE_REGEX = /\s+/g;
const TRAILING_COLON_REGEX = /:$/;
const LAT_LON_REGEX = /(-?\d{1,3}\.\d{4,})\s*[,/]\s*(-?\d{1,3}\.\d{4,})/;

export function parseDetailPage(
  html: string,
  recordId: string
): PortalDetailPage {
  const $ = load(html);

  return {
    attachments: parseAttachments($),
    coordinates: extractCoordinates($),
    fields: parseFields($),
    rawHtml: html,
    recordId,
    tables: parseTables($),
  };
}

// ---------------------------------------------------------------------------
// Field extraction (label → value pairs)
// ---------------------------------------------------------------------------

function parseFields($: CheerioAPI): Record<string, string> {
  const fields: Record<string, string> = {};

  // Oracle ADF uses <span class="xa">Label:</span> for field labels.
  // The value is typically in a sibling <td> as <span class="x6">Value</span>,
  // or in an <a>, <input>, <select>, or <textarea> nearby.
  $("span.xa").each((_, labelEl) => {
    const labelText = clean($(labelEl).text()).replace(
      TRAILING_COLON_REGEX,
      ""
    );
    if (!labelText || labelText.length > 80) {
      return;
    }

    // Walk up to the containing <td>, then find sibling <td> with the value
    const labelCell = $(labelEl).closest("td");
    const value = findValueNearLabel(labelCell);

    if (!value || isPlaceholder(value, labelText)) {
      return;
    }

    fields[labelText] = value;
  });

  // Also try <label> tags (some pages use both patterns)
  $("label").each((_, labelEl) => {
    const labelText = clean($(labelEl).text()).replace(
      TRAILING_COLON_REGEX,
      ""
    );
    if (!labelText || labelText.length > 80 || fields[labelText]) {
      return;
    }

    const targetId = $(labelEl).attr("for");
    const row = $(labelEl).closest("tr");
    const value = extractValueByTarget($, row, targetId);

    if (!value || isPlaceholder(value, labelText)) {
      return;
    }

    fields[labelText] = value;
  });

  return fields;
}

function findValueNearLabel(labelCell: ReturnType<CheerioAPI>): string {
  // Walk through sibling <td> elements after the label cell
  let current = labelCell.next("td");
  for (let i = 0; i < 3 && current.length > 0; i++) {
    const value = extractCellValue(current);
    if (value) {
      return value;
    }
    current = current.next("td");
  }
  return "";
}

function extractCellValue(cell: ReturnType<CheerioAPI>): string {
  // Check for value spans (class x6 is the most common value class)
  const valueSpan = cell.find("span.x6, span.x3m").first();
  if (valueSpan.length > 0) {
    const text = clean(valueSpan.text());
    if (text) {
      return text;
    }
  }

  // Check for links
  const link = cell.find("a.xj, a.xk").first();
  if (link.length > 0) {
    const text = clean(link.text());
    if (text) {
      return text;
    }
  }

  // Check for form controls
  const input = cell.find("input[value]").first();
  if (input.length > 0) {
    return clean(input.attr("value") ?? "");
  }

  const selected = cell.find("option[selected]").first();
  if (selected.length > 0) {
    return clean(selected.text());
  }

  const textarea = cell.find("textarea").first();
  if (textarea.length > 0) {
    return clean(textarea.text());
  }

  // Try plain text content if cell isn't a spacer
  const cellText = clean(cell.text());
  if (cellText && cellText.length > 0 && cellText.length < 500) {
    const isSpacerCell =
      cell.find("img[src*='t.gif']").length > 0 && cellText.length < 2;
    if (!isSpacerCell) {
      return cellText;
    }
  }

  return "";
}

function extractValueByTarget(
  $: CheerioAPI,
  row: ReturnType<CheerioAPI>,
  targetId?: string
): string {
  if (targetId) {
    const el = $(`[id="${cssEscape(targetId)}"]`).first();
    if (el.length > 0) {
      const tag = tagName(el.get(0));
      if (tag === "input") {
        return clean(el.attr("value") ?? "");
      }
      if (tag === "textarea") {
        return clean(el.text());
      }
      if (tag === "select") {
        return clean(el.find("option[selected]").first().text());
      }
      return clean(el.text());
    }
  }

  // Fall back to adjacent cell text
  const cells = row
    .find("td")
    .map((_, el) => clean($(el).text()))
    .get()
    .filter(Boolean);

  return cells.find((c) => c.length > 0 && c.length < 500) ?? "";
}

// ---------------------------------------------------------------------------
// Table extraction
// ---------------------------------------------------------------------------

function parseTables($: CheerioAPI): DetailTable[] {
  const tables: DetailTable[] = [];

  $("table.x2d").each((_, tableEl) => {
    const table = $(tableEl);
    const headers: string[] = [];

    table.find("thead th, tr:first-child th").each((_, thEl) => {
      const text = clean($(thEl).text());
      if (text && text.length < 100) {
        headers.push(text);
      }
    });

    if (headers.length < 2) {
      return;
    }

    // Try to find a section name from a preceding h2 or the table's own caption
    const sectionHeader = table.closest("div").prevAll("h2").first().text();
    const name = clean(sectionHeader) || headers.slice(0, 3).join(" / ");

    const rows: Record<string, string>[] = [];
    table.find("tbody tr, tr").each((_, rowEl) => {
      const row = $(rowEl);
      const cells = row.find("td");
      if (cells.length < 2) {
        return;
      }

      const record: Record<string, string> = {};
      let hasValue = false;

      cells.each((idx, cellEl) => {
        if (idx >= headers.length) {
          return;
        }
        const header = headers[idx];
        if (!header) {
          return;
        }
        const cellText = clean($(cellEl).text());
        if (cellText) {
          record[header] = cellText;
          hasValue = true;
        }
      });

      if (hasValue) {
        rows.push(record);
      }
    });

    if (rows.length > 0) {
      tables.push({ headers, name, rows });
    }
  });

  return tables;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

function parseAttachments($: CheerioAPI): DetailAttachment[] {
  const attachments: DetailAttachment[] = [];

  // Look for attachment tables — typically contain "Attachment ID" header
  $("table.x2d").each((_, tableEl) => {
    const table = $(tableEl);
    const headerText = table
      .find("th")
      .map((_, th) => clean($(th).text()))
      .get();

    const hasAttachmentId = headerText.some((h) =>
      h.toLowerCase().includes("attachment id")
    );
    if (!hasAttachmentId) {
      return;
    }

    const idIdx = headerText.findIndex((h) =>
      h.toLowerCase().includes("attachment id")
    );
    const typeIdx = headerText.findIndex((h) =>
      h.toLowerCase().includes("attachment type")
    );
    const descIdx = headerText.findIndex((h) =>
      h.toLowerCase().includes("description")
    );
    const uploaderIdx = headerText.findIndex((h) =>
      h.toLowerCase().includes("uploaded by")
    );
    const dateIdx = headerText.findIndex((h) =>
      h.toLowerCase().includes("upload date")
    );

    table.find("tr").each((_, rowEl) => {
      const row = $(rowEl);
      const cells = row.find("td");
      if (cells.length < 3) {
        return;
      }

      const cellTexts = cells.map((_, c) => clean($(c).text())).get();
      const attachmentId = cellTexts[idIdx] ?? "";
      if (!attachmentId) {
        return;
      }

      // Find download link
      const link = row.find("a[href*='/filestore/']").first();
      const href = link.attr("href") ?? "";
      const url = href ? toAbsoluteUrl(href) : "";

      attachments.push({
        attachmentId,
        attachmentType: cellTexts[typeIdx] ?? "",
        description: cellTexts[descIdx] ?? "",
        uploadDate: cellTexts[dateIdx] ?? "",
        uploadedBy: cellTexts[uploaderIdx] ?? "",
        url,
      });
    });
  });

  return attachments;
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

function extractCoordinates($: CheerioAPI): DetailCoordinates | null {
  // Strategy 1: Combined lat/long in a single cell (e.g. "33.429/-112.261")
  let coordText = "";
  $("td").each((_, tdEl) => {
    const text = clean($(tdEl).text());
    if (LAT_LON_REGEX.test(text) && !coordText) {
      coordText = text;
    }
  });

  if (coordText) {
    const match = coordText.match(LAT_LON_REGEX);
    if (match?.[1] && match?.[2]) {
      const coords = parseCoordPair(match[1], match[2]);
      if (coords) {
        return coords;
      }
    }
  }

  // Strategy 2: Separate Latitude/Longitude columns in a table
  const result = findCoordsInTables($);
  if (result) {
    return result;
  }

  return null;
}

function findCoordsInTables($: CheerioAPI): DetailCoordinates | null {
  const latHeaders = ["Latitude", "Lat"];
  const lonHeaders = ["Longitude", "Long", "Lng"];
  const tables = $("table.x2d").toArray();

  for (const tableEl of tables) {
    const table = $(tableEl);
    const headers = table
      .find("th")
      .map((_, th) => clean($(th).text()))
      .get();

    const latIdx = headers.findIndex((h) =>
      latHeaders.some((lh) => h.includes(lh))
    );
    const lonIdx = headers.findIndex((h) =>
      lonHeaders.some((lh) => h.includes(lh))
    );

    if (latIdx < 0 || lonIdx < 0) {
      continue;
    }

    const rows = table.find("tr").toArray();
    for (const rowEl of rows) {
      const cells = $(rowEl).find("td");
      const latText = clean(cells.eq(latIdx).text());
      const lonText = clean(cells.eq(lonIdx).text());
      const coords = parseCoordPair(latText, lonText);
      if (coords) {
        return coords;
      }
    }
  }

  return null;
}

function parseCoordPair(
  latStr: string,
  lonStr: string
): DetailCoordinates | null {
  const latitude = Number.parseFloat(latStr);
  const longitude = Number.parseFloat(lonStr);

  if (
    !(Number.isFinite(latitude) && Number.isFinite(longitude)) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clean(value: string): string {
  return value.replaceAll("\u00a0", " ").replace(WHITESPACE_REGEX, " ").trim();
}

function isPlaceholder(value: string, label: string): boolean {
  const v = value.toLowerCase().trim();
  const l = label.toLowerCase().trim();
  if (!v || v === l || v === `${l}:`) {
    return true;
  }
  if (v.endsWith(":") && v.length <= 30) {
    return true;
  }
  if (v.includes("please select") || v.includes("please provide")) {
    return true;
  }
  return false;
}

function tagName(node: AnyNode | undefined): string {
  if (!node || typeof node !== "object" || !("tagName" in node)) {
    return "";
  }
  const value = (node as { tagName?: unknown }).tagName;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function cssEscape(id: string): string {
  return id.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function toAbsoluteUrl(url: string): string {
  const trimmed = clean(url);
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${BASE_URL}${trimmed}`;
  }
  return `${BASE_URL}/${trimmed}`;
}

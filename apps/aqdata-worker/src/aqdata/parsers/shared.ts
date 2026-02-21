/**
 * Shared HTML-as-XLS parsing utilities.
 *
 * The AQData portal exports all sections as HTML `<table>` markup saved with
 * an `.xls` extension. Every parser needs the same cell extraction and value
 * conversion helpers — this module provides them.
 */

const CELL_REGEX = /<td[^>]*>([\s\S]*?)<\/td>/gi;
const TD_OPEN_REGEX = /<td[^>]*>/gi;
const TD_CLOSE_REGEX = /<\/td>/gi;
const HTML_TAG_REGEX = /<[^>]+>/g;
const WHITESPACE_REGEX = /\s+/g;

/**
 * Extract text content from all `<td>` cells in an HTML row fragment.
 *
 * Stops before any nested `<table>` by default (set `beforeNestedTable`
 * to false to include the full row).
 */
export function extractCells(
  rowHtml: string,
  beforeNestedTable = true
): string[] {
  const content = beforeNestedTable ? stripNestedTable(rowHtml) : rowHtml;

  const cellMatches = content.match(CELL_REGEX) ?? [];
  const cells: string[] = [];

  for (const cellHtml of cellMatches) {
    const text = cellHtml
      .replace(TD_OPEN_REGEX, "")
      .replace(TD_CLOSE_REGEX, "")
      .replace(HTML_TAG_REGEX, "")
      .replaceAll("&nbsp;", " ")
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replace(WHITESPACE_REGEX, " ")
      .trim();
    cells.push(text);
  }

  return cells;
}

/**
 * Extract the nested `<table>` HTML from within a row, if present.
 * Returns the full nested table markup or an empty string.
 */
export function extractNestedTable(rowHtml: string): string {
  const start = rowHtml.indexOf("<table");
  if (start < 0) {
    return "";
  }
  return rowHtml.slice(start);
}

/**
 * Parse rows from a nested `<table>` inside a cell.
 * Returns an array of cell arrays (one per `<tr>` after the header row).
 */
export function parseNestedTableRows(tableHtml: string): string[][] {
  if (!tableHtml) {
    return [];
  }

  const rows: string[][] = [];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
  let isFirst = true;

  for (const match of tableHtml.matchAll(rowRegex)) {
    // Skip header row
    if (isFirst) {
      isFirst = false;
      continue;
    }
    const cells = extractCells(match[1] ?? "", false);
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

function stripNestedTable(html: string): string {
  const idx = html.indexOf("<table");
  return idx > 0 ? html.slice(0, idx) : html;
}

// ---------------------------------------------------------------------------
// Value converters
// ---------------------------------------------------------------------------

export function str(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

export function nullStr(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const s = String(value).trim();
  return s === "" || s === "&nbsp;" ? null : s;
}

export function formatDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const s = String(value).trim();
  if (s === "" || s === "&nbsp;" || s === "NaT") {
    return null;
  }

  // Handle Excel serial date numbers
  const maybeSerial = Number.parseFloat(s);
  if (
    !Number.isNaN(maybeSerial) &&
    maybeSerial > 30_000 &&
    maybeSerial < 60_000
  ) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + maybeSerial * 86_400_000);
    return date.toISOString().split("T")[0] ?? null;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString().split("T")[0] ?? null;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const s = String(value)
    .replaceAll(/[$,\s]/g, "")
    .trim();
  if (s === "") {
    return null;
  }
  const num = Number.parseFloat(s);
  return Number.isNaN(num) ? null : num;
}

export function toBool(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  const s = String(value).trim().toLowerCase();
  return s === "yes" || s === "true" || s === "y" || s === "1";
}

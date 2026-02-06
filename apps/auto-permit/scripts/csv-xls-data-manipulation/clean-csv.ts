import { promises as fs } from "node:fs";

const inputFile = "dustApplications.csv";
const outputFile = "dustApplications_cleaned.csv";

// Simple CSV parser that respects quotes
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentCell += '"';
        i++;
      } else {
        // Toggle quotes
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // End of cell
      currentRow.push(currentCell);
      currentCell = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      // End of row
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  return rows;
}

// CSV Stringifier
function stringifyCSV(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(",")
    )
    .join("\n");
}

function processPrimaryRow(row: string[], cleanedRows: string[][]): string[] {
  // First, clear the placeholder headers (if they exist as strict matches)
  if (row[17] === "Invoice Number") {
    row[17] = "";
  }
  if (row[18] === "Invoice Charges") {
    row[18] = "";
  }
  if (row[19] === "Invoice Balance") {
    row[19] = "";
  }

  cleanedRows.push(row);
  return row;
}

function processInvoiceRow(
  row: string[],
  lastPrimaryRow: string[] | null
): boolean {
  if (!lastPrimaryRow) {
    return false;
  }

  const col17 = (row[17] || "").trim();
  const col18 = (row[18] || "").trim();
  const col19 = (row[19] || "").trim();

  if (col17) {
    lastPrimaryRow[17] = col17;
  }
  if (col18) {
    lastPrimaryRow[18] = col18;
  }
  if (col19) {
    lastPrimaryRow[19] = col19;
  }
  return true;
}

function processRows(rows: string[][]): {
  cleanedRows: string[][];
  simpleRowCount: number;
  mergedCount: number;
} {
  const cleanedRows: string[][] = [];
  let lastPrimaryRow: string[] | null = null;
  let mergedCount = 0;
  let simpleRowCount = 0;

  // Header is row 0
  const header = rows[0];
  if (header && header.length >= 20) {
    header[17] = "Invoice Number";
    header[18] = "Invoice Charges";
    header[19] = "Invoice Balance";
    cleanedRows.push(header);
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) {
      continue;
    }

    while (row.length < 20) {
      row.push("");
    }

    const col0 = (row[0] || "").trim();
    const col17 = (row[17] || "").trim();
    const col18 = (row[18] || "").trim();
    const col19 = (row[19] || "").trim();

    const isPrimary = col0.startsWith("D");
    const isInvoice =
      col0 === "" && (col17 !== "" || col18 !== "" || col19 !== "");

    if (isPrimary) {
      lastPrimaryRow = processPrimaryRow(row, cleanedRows);
      simpleRowCount++;
    } else if (isInvoice && processInvoiceRow(row, lastPrimaryRow)) {
      mergedCount++;
    }
  }

  return { cleanedRows, simpleRowCount, mergedCount };
}

async function clean() {
  console.log(`Reading ${inputFile}...`);
  const content = await fs.readFile(inputFile, "utf-8");
  const rows = parseCSV(content);

  if (rows.length === 0) {
    console.log("Empty file.");
    return;
  }

  const { cleanedRows, simpleRowCount, mergedCount } = processRows(rows);

  console.log("Filtering complete.");
  console.log(`Primary Records: ${simpleRowCount}`);
  console.log(`Merged Invoice Lines: ${mergedCount}`);

  console.log(`Writing to ${outputFile}...`);
  const outputContent = stringifyCSV(cleanedRows);
  await fs.writeFile(outputFile, outputContent);
  console.log("Done.");
}

clean().catch(console.error);

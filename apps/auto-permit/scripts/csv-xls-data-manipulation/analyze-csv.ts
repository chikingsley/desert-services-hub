import { promises as fs } from "node:fs";

const inputFile = "dustApplications_cleaned.csv";

// Reuse the CSV parser logic
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
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
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

async function analyze() {
  console.log(`Reading ${inputFile}...`);
  const content = await fs.readFile(inputFile, "utf-8");
  const rows = parseCSV(content);

  // Remove header
  const header = rows.shift();
  if (!header) {
    return;
  }

  // Indices based on header:
  // Status: 4
  // Previous Dust App No: 9
  // Invoice Number: 17
  // Invoice Charges: 18

  // 1. Check Invoice Charges
  const rowsWithCharges = rows.filter(
    (r) => r[18] && r[18].trim() !== "" && r[18] !== "0"
  );
  console.log("\n--- Invoice Charges Analysis ---");
  console.log(
    `Total rows with non-zero Invoice Charges: ${rowsWithCharges.length}`
  );
  if (rowsWithCharges.length > 0) {
    console.log("Examples (Status | Invoice # | Charge):");
    for (const r of rowsWithCharges.slice(0, 5)) {
      console.log(`  ${r[4]} | ${r[17]} | ${r[18]}`);
    }
  }

  // 2. Check rows WITHOUT Invoice Number
  const rowsWithoutInvoice = rows.filter((r) => !r[17] || r[17].trim() === "");
  console.log("\n--- Missing Invoice Number Analysis ---");
  console.log(
    `Total rows without Invoice Number: ${rowsWithoutInvoice.length}`
  );

  // Status distribution
  const statusCounts: Record<string, number> = {};
  for (const r of rowsWithoutInvoice) {
    const status = r[4] || "Unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  console.log("\nStatus distribution for rows with NO Invoice Number:");
  for (const [status, count] of Object.entries(statusCounts).sort(
    ([, a], [, b]) => b - a
  )) {
    console.log(`  ${status}: ${count}`);
  }

  // Previous App ID distribution (Do they supersede?)
  let supersedeCount = 0;
  for (const r of rowsWithoutInvoice) {
    if (r[9] && r[9].trim() !== "") {
      supersedeCount++;
    }
  }
  console.log(
    `\nOf the ${rowsWithoutInvoice.length} rows with NO Invoice Number:`
  );
  console.log(
    `  ${supersedeCount} have a "Previous Dust Application No." (They supersede another project)`
  );
  console.log(
    `  ${rowsWithoutInvoice.length - supersedeCount} DO NOT have a "Previous Dust Application No."`
  );
}

analyze().catch(console.error);

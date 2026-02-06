import { promises as fs } from "node:fs";

const inputFile = "dustApplicationSearch.xls";
const outputFile = "dustApplicationSearch_converted.csv";

const INVOICE_REGEX =
  /<tr>\s*<td>(IV.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/;

async function convert() {
  console.log(`Reading ${inputFile}...`);
  // Read as simple string. 20MB is fine for node/bun buffer.
  const content = await fs.readFile(inputFile, "utf-8");

  // Split by the start of a main record.
  // Based on inspection, main records start with "<tr><td>D" followed by a digit.
  // We use a lookahead or just split and reconstruct.
  // Regex: /<tr><td>D\d/
  // Let's use a regex split that keeps the delimiter or just find matches.

  // Better: Find all main 'tr' blocks.
  // They appear to be structured as: <tr><td>D... ... </tr>
  // But they contain nested <tr> inside the last <td>.

  // Strategy: Split by "<tr><td>D". This gives us chunks where each chunk starts with the ID (minus the prefix).
  // The previous chunk will contain the tail of the previous record.

  const rawChunks = content.split("<tr><td>D");

  // Chunk 0 is the header/preamble ("<table...>..."). We might want to parse header from it or just hardcode.
  // chunks 1..N are the records.

  const headers = [
    "Dust Application ID",
    "Project Name",
    "Company ID",
    "Company Name",
    "Status",
    "Submitted Date",
    "Effective Date",
    "Expiration Date",
    "Closed Date",
    "Previous Dust Application No.",
    "Project Start Date",
    "Project Completion Date",
    "Project Address",
    "Project City",
    "Parcel No.",
    "Block Permit?",
    "Accelerated?",
    "Invoice Number",
    "Invoice Charges",
    "Invoice Balance",
  ];

  const outputRows: string[] = [];
  outputRows.push(headers.map((h) => `"${h}"`).join(",")); // CSV Header

  console.log(`Found ${rawChunks.length - 1} potential records.`);

  let processedCount = 0;

  for (let i = 1; i < rawChunks.length; i++) {
    const chunk = rawChunks[i];
    if (!chunk) {
      continue;
    }

    // Re-attach the "D" that was consumed by split
    // The split was on "<tr><td>D", so the chunk starts with the character AFTER D.
    // Wait, "<tr><td>D" -> split removes the whole string "<tr><td>D".
    // So the chunk starts with the rest of the ID.
    // We need to prepend "D".

    // Let's verify what characters follow D. Usually digits.
    // So chunk starts with "0064187</td><td>..."

    const idEndIndex = chunk.indexOf("</td>");
    const idRest = chunk.substring(0, idEndIndex);
    const fullId = `D${idRest}`; // Reconstruct ID

    // Now parse the rest of the columns.
    // We can just regex for '<td>(.*?)</td>' in the chunk.
    // Note: The chunk might contain the Nested Table which has its own tds.
    // We need to be careful to grab the FIRST set of tds which correspond to the main columns.

    // The main row has columns 2 to 17 (since ID is col 1) before the Invoice column.
    // 2: Name, 3: CompID, 4: CompName, 5: Status, 6: SubDate, 7: EffDate, 8: ExpDate, 9: CloseDate,
    // 10: PrevID, 11: StartDate, 12: CompDate, 13: Addr, 14: City, 15: Parcel, 16: Block, 17: Accel.
    // Total 16 columns to extract linearly.

    const mainCols: string[] = [fullId];

    // Helper to extract next N cells
    // We seek '<td>' start indices?
    // Or just use a regex with logic.

    // Regex global match for `<td>(.*?)</td>`
    // CAUTION: The nested table also has `<td>`.
    // BUT the nested table is inside the LAST column.
    // So the first 16 occurrences of `<td>...</td>` *after* the ID should be the main columns.

    // Let's iterate.
    let residue = chunk.substring(idEndIndex + 5); // Skip first </td>

    for (let c = 0; c < 16; c++) {
      // Find next <td>...</td>
      // Note: cell content might be empty or &nbsp;
      const openTag = "<td>";
      const closeTag = "</td>";
      const start = residue.indexOf(openTag);
      if (start === -1) {
        mainCols.push("");
        continue;
      }

      const contentStart = start + openTag.length;
      const end = residue.indexOf(closeTag, contentStart);

      if (end === -1) {
        mainCols.push("");
        continue;
      }

      let val = residue.substring(contentStart, end);

      // Clean value
      val = val.replace(/&nbsp;/g, " ").trim();
      mainCols.push(val);

      // Advance residue
      residue = residue.substring(end + closeTag.length);
    }

    // Now we are at the Invoice Column (Nested Table).
    // Residue contains the rest of the main row, which includes:
    // <td><table...>...</table></td> </tr>

    // Let's look for Invoice Data in the residue
    // Pattern: <tr><td>IV...</td><td>...</td><td>...</td></tr>

    let invNum = "";
    let invCharge = "";
    let invBal = "";

    const invoiceMatch = residue.match(INVOICE_REGEX);

    if (invoiceMatch) {
      invNum = (invoiceMatch[1] || "").trim();
      invCharge = (invoiceMatch[2] || "").trim();
      invBal = (invoiceMatch[3] || "").trim();
    }

    // Add to cols
    mainCols.push(invNum);
    mainCols.push(invCharge);
    mainCols.push(invBal);

    // CSV escape and join
    const csvLine = mainCols
      .map((val) => {
        if (val.includes('"') || val.includes(",") || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      })
      .join(",");

    outputRows.push(csvLine);
    processedCount++;
  }

  console.log(`Processed ${processedCount} records.`);
  console.log(`Writing to ${outputFile}...`);
  await fs.writeFile(outputFile, outputRows.join("\n"));
  console.log("Done.");
}

convert().catch(console.error);

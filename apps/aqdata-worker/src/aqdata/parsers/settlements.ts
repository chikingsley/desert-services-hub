import type { Settlement } from "../types";
import { extractCells, nullStr, parseNumber } from "./shared";

const SETTLEMENT_ID_REGEX = /^SA\d+$/;
const ROW_SPLIT_REGEX = /<tr><td>SA(?=\d)/i;

// Settlement ID | Company ID | Company Name | Enforcement Action(s) | State | Settlement Amount
const COL = {
  SETTLEMENT_ID: 0,
  COMPANY_ID: 1,
  COMPANY_NAME: 2,
  ENFORCEMENT_ACTION: 3,
  STATE: 4,
  SETTLEMENT_AMOUNT: 5,
} as const;

const MIN_CELLS = 5;

export function parseSettlementExport(data: Buffer): Settlement[] {
  const content = data.toString("utf8");
  const chunks = content.split(ROW_SPLIT_REGEX);
  const results: Settlement[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }

    const cells = extractCells(`<tr><td>SA${chunk}`);
    if (cells.length < MIN_CELLS) {
      continue;
    }

    const id = cells[COL.SETTLEMENT_ID] ?? "";
    if (!SETTLEMENT_ID_REGEX.test(id)) {
      continue;
    }

    results.push({
      companyId: nullStr(cells[COL.COMPANY_ID]),
      companyName: nullStr(cells[COL.COMPANY_NAME]),
      enforcementActionId: nullStr(cells[COL.ENFORCEMENT_ACTION]),
      settlementAmount: parseNumber(cells[COL.SETTLEMENT_AMOUNT]),
      settlementId: id,
      state: nullStr(cells[COL.STATE]),
    });
  }

  return results;
}

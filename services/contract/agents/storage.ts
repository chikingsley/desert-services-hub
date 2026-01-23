/**
 * Storage layer for agent extraction results
 * Provides functions to store and retrieve extraction results from SQLite.
 */
import { db } from "@/lib/db";
import type { AgentName } from "./types";

/**
 * Row type for contract_extractions table
 */
type ExtractionRow = {
  agent_name: string;
  data: string;
  status: string;
  error_message: string | null;
  duration_ms: number;
};

/**
 * Store an agent's extraction result.
 * Uses INSERT OR REPLACE to handle re-extraction for the same contract/agent.
 */
export function storeAgentResult(
  contractId: number,
  agentName: AgentName,
  data: unknown,
  status: "success" | "error",
  errorMessage: string | null,
  durationMs: number
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO contract_extractions
    (contract_id, agent_name, data, status, error_message, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    contractId,
    agentName,
    JSON.stringify(data),
    status,
    errorMessage,
    durationMs
  );
}

/**
 * Get all extraction results for a contract.
 * Returns results ordered by agent name for consistent output.
 */
export function getAgentResults(contractId: number): Array<{
  agentName: AgentName;
  data: unknown;
  status: string;
  errorMessage: string | null;
  durationMs: number;
}> {
  const rows = db
    .query<ExtractionRow, [number]>(
      `SELECT agent_name, data, status, error_message, duration_ms
       FROM contract_extractions
       WHERE contract_id = ?
       ORDER BY agent_name`
    )
    .all(contractId);

  return rows.map((row) => ({
    agentName: row.agent_name as AgentName,
    data: JSON.parse(row.data),
    status: row.status,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
  }));
}

/**
 * Convenience function to get all successful extractions as a keyed object.
 * Returns null if no extractions exist for the contract.
 */
export function getAllExtractedData(
  contractId: number
): Record<AgentName, unknown> | null {
  const rows = db
    .query<ExtractionRow, [number]>(
      `SELECT agent_name, data
       FROM contract_extractions
       WHERE contract_id = ? AND status = 'success'`
    )
    .all(contractId);

  if (rows.length === 0) {
    return null;
  }

  const result = {} as Record<AgentName, unknown>;
  for (const row of rows) {
    result[row.agent_name as AgentName] = JSON.parse(row.data);
  }
  return result;
}

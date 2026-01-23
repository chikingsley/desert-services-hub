/**
 * Multi-agent extraction orchestrator
 * Runs all 7 extraction agents in parallel using Promise.allSettled.
 * Partial failures do not crash the entire extraction.
 */
import type { Mistral } from "@mistralai/mistralai";
import { extractBilling } from "./extractors/billing";
import { extractContacts } from "./extractors/contacts";
import { extractContractInfo } from "./extractors/contract-info";
import { extractInsurance } from "./extractors/insurance";
import { extractRedFlags } from "./extractors/red-flags";
import { extractSiteInfo } from "./extractors/site-info";
import { extractSOV } from "./extractors/sov";
import { storeAgentResult } from "./storage";
import type { AgentName, AgentResult } from "./types";

interface AgentDefinition {
  name: AgentName;
  fn: (fullText: string, mistral: Mistral) => Promise<unknown>;
}

const AGENTS: AgentDefinition[] = [
  { name: "contractInfo", fn: extractContractInfo },
  { name: "billing", fn: extractBilling },
  { name: "contacts", fn: extractContacts },
  { name: "sov", fn: extractSOV },
  { name: "insurance", fn: extractInsurance },
  { name: "siteInfo", fn: extractSiteInfo },
  { name: "redFlags", fn: extractRedFlags },
];

/**
 * Run all extraction agents in parallel.
 * Uses Promise.allSettled to handle partial failures gracefully.
 * Each agent result is stored in SQLite regardless of success/failure.
 *
 * @param contractId - The contract ID to associate results with
 * @param fullText - Full document text with page breaks
 * @param mistral - Mistral client instance
 * @returns Map of agent names to their results
 */
export async function runAllAgents(
  contractId: number,
  fullText: string,
  mistral: Mistral
): Promise<Map<AgentName, AgentResult<unknown>>> {
  const startTime = Date.now();

  // Run all agents in parallel
  const results = await Promise.allSettled(
    AGENTS.map(async (agent) => {
      const agentStart = Date.now();
      try {
        const data = await agent.fn(fullText, mistral);
        const durationMs = Date.now() - agentStart;

        // Store successful result
        storeAgentResult(
          contractId,
          agent.name,
          data,
          "success",
          null,
          durationMs
        );

        return {
          agentName: agent.name,
          status: "success" as const,
          data,
          durationMs,
        };
      } catch (error) {
        const durationMs = Date.now() - agentStart;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Store failed result
        storeAgentResult(
          contractId,
          agent.name,
          null,
          "error",
          errorMessage,
          durationMs
        );

        return {
          agentName: agent.name,
          status: "error" as const,
          error: errorMessage,
          durationMs,
        };
      }
    })
  );

  // Collect results into a map
  const resultMap = new Map<AgentName, AgentResult<unknown>>();
  for (const result of results) {
    if (result.status === "fulfilled") {
      resultMap.set(result.value.agentName, result.value);
    }
  }

  const totalDuration = Date.now() - startTime;
  const successCount = [...resultMap.values()].filter(
    (r) => r.status === "success"
  ).length;
  const errorCount = [...resultMap.values()].filter(
    (r) => r.status === "error"
  ).length;

  // Log summary (will be visible in pipeline output)
  console.log(
    `[Extraction] Completed ${resultMap.size} agents in ${totalDuration}ms (${successCount} success, ${errorCount} errors)`
  );

  return resultMap;
}

/**
 * Get a summary of extraction results for logging/display.
 */
export function summarizeResults(
  results: Map<AgentName, AgentResult<unknown>>
): {
  success: AgentName[];
  errors: Array<{ agent: AgentName; error: string }>;
} {
  const success: AgentName[] = [];
  const errors: Array<{ agent: AgentName; error: string }> = [];

  for (const [name, result] of results) {
    if (result.status === "success") {
      success.push(name);
    } else if (result.error) {
      errors.push({ agent: name, error: result.error });
    }
  }

  return { success, errors };
}

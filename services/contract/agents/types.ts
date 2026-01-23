/**
 * Multi-agent extraction types
 * These types define the structure of agent execution results.
 */

/**
 * Names of all extraction agents
 */
export type AgentName =
  | "contractInfo"
  | "billing"
  | "contacts"
  | "sov"
  | "insurance"
  | "siteInfo"
  | "redFlags";

/**
 * Result of a single agent execution
 */
export type AgentResult<T = unknown> = {
  agentName: AgentName;
  status: "success" | "error";
  data?: T;
  error?: string;
  durationMs: number;
};

/**
 * Collection of all agent results, keyed by agent name
 */
export type ExtractionResults = Map<AgentName, AgentResult>;

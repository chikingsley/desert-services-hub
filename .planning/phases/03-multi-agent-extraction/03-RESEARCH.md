# Phase 3: Multi-Agent Extraction - Research

**Researched:** 2026-01-23
**Domain:** LLM-based structured data extraction, Mistral AI, parallel processing, Zod validation
**Confidence:** HIGH

## Summary

Phase 3 implements parallel extraction agents that pull structured data from contract documents with page citations. The existing infrastructure from Phase 2 provides per-page text storage in SQLite (`contract_pages` table), which is the foundation for citation tracking.

The approach uses Mistral AI's structured output capabilities with `client.chat.parse()` and Zod schemas to ensure type-safe, validated JSON responses. Seven specialized extraction agents (Contract Info, Billing, Contacts, SOV, Insurance, Site Info, Red Flags) run in parallel using `Promise.allSettled()` to maximize speed while handling partial failures gracefully. Each agent receives the full document text with page breaks, and the prompts instruct the model to cite page numbers for each extracted field.

The key architectural decision is using Mistral's custom structured output mode (passing a Zod schema to `responseFormat`) rather than basic JSON mode. This provides schema enforcement at the API level plus runtime validation, giving double protection against malformed outputs. For citation tracking, each extracted field includes an optional `pageReference` property that stores the page number(s) where the information was found.

**Primary recommendation:** Use `@mistralai/mistralai` SDK with `client.chat.parse()` passing Zod schemas directly to `responseFormat`. Run all 7 agents in parallel with `Promise.allSettled()`. Store results in a new `contract_extractions` table with agent name, JSON data, and confidence score.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @mistralai/mistralai | ^1.13.0 | LLM structured extraction | Already installed; supports `chat.parse()` with Zod schemas |
| zod | ^4.3.6 | Schema definition & validation | Already installed; TypeScript-first, supports `.describe()` for LLM hints |
| bun:sqlite | built-in | Storage for extractions | Already in use; consistent with Phase 1-2 patterns |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod-to-json-schema | ^3.25.1 | Convert Zod to JSON Schema | Already installed via Mistral SDK; used internally |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Mistral chat.parse | Vercel AI SDK generateObject | Vercel adds abstraction layer; direct SDK is simpler |
| Promise.allSettled | Promise.all | allSettled handles partial failures; all fails fast on first error |
| Single model call | Multiple specialized agents | Specialized agents improve accuracy; single call cheaper but less accurate |
| Structured output | JSON mode + manual parse | Structured output enforces schema at API level; JSON mode only guarantees valid JSON |

**Installation:**
```bash
# All dependencies already installed, no action needed
```

## Architecture Patterns

### Recommended Project Structure
```
services/
  contract/
    extraction/                  # (existing from Phase 2)
      types.ts                   # ExtractedPage, ExtractionResult
      storage.ts                 # storeExtractedPages, getExtractedPages
      ...
    agents/                      # NEW: Multi-agent extraction
      types.ts                   # Agent result types, citation types
      schemas/                   # Zod schemas for each domain
        contract-info.ts         # ContractInfoSchema
        billing.ts               # BillingSchema
        contacts.ts              # ContactsSchema
        sov.ts                   # ScheduleOfValuesSchema
        insurance.ts             # InsuranceSchema
        site-info.ts             # SiteInfoSchema
        red-flags.ts             # RedFlagsSchema
      extractors/                # Agent implementations
        contract-info.ts         # extractContractInfo()
        billing.ts               # extractBilling()
        contacts.ts              # extractContacts()
        sov.ts                   # extractSOV()
        insurance.ts             # extractInsurance()
        site-info.ts             # extractSiteInfo()
        red-flags.ts             # extractRedFlags()
      orchestrator.ts            # runAllAgents() - parallel execution
      storage.ts                 # storeAgentResults()
```

### Pattern 1: Agent with Structured Output

**What:** Each agent calls Mistral with a Zod schema and receives typed, validated output.

**When to use:** Every extraction agent follows this pattern.

**Example:**
```typescript
// Source: https://docs.mistral.ai/capabilities/structured_output/custom
import { z } from "zod";
import { Mistral } from "@mistralai/mistralai";

// Schema with LLM guidance via .describe()
const ContractInfoSchema = z.object({
  contractType: z
    .enum(["LOI", "Subcontract", "Work Order", "Amendment", "Unknown"])
    .describe("Type of contract document"),
  contractDate: z
    .string()
    .nullable()
    .describe("Date contract was signed/dated, format: YYYY-MM-DD"),
  contractValue: z
    .number()
    .nullable()
    .describe("Total contract value in USD, without currency symbols"),
  projectName: z
    .string()
    .describe("Name of the project"),
  projectAddress: z
    .string()
    .nullable()
    .describe("Full street address of the project site"),
  startDate: z
    .string()
    .nullable()
    .describe("Project start date, format: YYYY-MM-DD"),
  endDate: z
    .string()
    .nullable()
    .describe("Project completion/end date, format: YYYY-MM-DD"),
  pageReferences: z
    .array(z.number())
    .describe("Page numbers where this information was found (1-indexed)"),
});

type ContractInfo = z.infer<typeof ContractInfoSchema>;

export async function extractContractInfo(
  fullText: string,
  mistral: Mistral
): Promise<ContractInfo> {
  const response = await mistral.chat.parse({
    model: "mistral-large-latest",
    messages: [
      {
        role: "system",
        content: `You are a contract analysis expert. Extract the requested information from the contract document.

IMPORTANT: For pageReferences, cite the page number(s) where you found each piece of information.
Pages are separated by "---PAGE BREAK---" markers. Page 1 is before the first marker.
If information is not found in the document, use null for that field.`,
      },
      {
        role: "user",
        content: fullText,
      },
    ],
    responseFormat: ContractInfoSchema,
    maxTokens: 1024,
    temperature: 0, // Deterministic for extraction
  });

  return response.choices[0].message.parsed as ContractInfo;
}
```

### Pattern 2: Parallel Agent Orchestration

**What:** Run all agents simultaneously using `Promise.allSettled()` to handle partial failures.

**When to use:** When executing the full extraction pipeline.

**Example:**
```typescript
// Source: Pattern derived from MDN Promise.allSettled documentation
import type { Mistral } from "@mistralai/mistralai";
import { extractContractInfo } from "./extractors/contract-info";
import { extractBilling } from "./extractors/billing";
import { extractContacts } from "./extractors/contacts";
import { extractSOV } from "./extractors/sov";
import { extractInsurance } from "./extractors/insurance";
import { extractSiteInfo } from "./extractors/site-info";
import { extractRedFlags } from "./extractors/red-flags";

type AgentName =
  | "contractInfo"
  | "billing"
  | "contacts"
  | "sov"
  | "insurance"
  | "siteInfo"
  | "redFlags";

type AgentResult<T> = {
  agentName: AgentName;
  status: "success" | "error";
  data?: T;
  error?: string;
  durationMs: number;
};

export async function runAllAgents(
  fullText: string,
  mistral: Mistral
): Promise<Map<AgentName, AgentResult<unknown>>> {
  const startTime = Date.now();

  const agents: Array<{ name: AgentName; fn: () => Promise<unknown> }> = [
    { name: "contractInfo", fn: () => extractContractInfo(fullText, mistral) },
    { name: "billing", fn: () => extractBilling(fullText, mistral) },
    { name: "contacts", fn: () => extractContacts(fullText, mistral) },
    { name: "sov", fn: () => extractSOV(fullText, mistral) },
    { name: "insurance", fn: () => extractInsurance(fullText, mistral) },
    { name: "siteInfo", fn: () => extractSiteInfo(fullText, mistral) },
    { name: "redFlags", fn: () => extractRedFlags(fullText, mistral) },
  ];

  // Run all agents in parallel
  const results = await Promise.allSettled(
    agents.map(async (agent) => {
      const agentStart = Date.now();
      try {
        const data = await agent.fn();
        return {
          agentName: agent.name,
          status: "success" as const,
          data,
          durationMs: Date.now() - agentStart,
        };
      } catch (error) {
        return {
          agentName: agent.name,
          status: "error" as const,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - agentStart,
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

  return resultMap;
}
```

### Pattern 3: Citation-Aware Schema Design

**What:** Include page reference fields in every schema so humans can verify extracted data.

**When to use:** All extraction schemas.

**Example:**
```typescript
// Source: Derived from existing codebase patterns + Mistral docs
import { z } from "zod";

// Reusable citation field
const pageReferencesField = z
  .array(z.number().int().positive())
  .describe("Page numbers where this information was found (1-indexed)");

// Per-field citation pattern for high-value fields
const CitedValueSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    pageRef: z.number().int().positive().nullable()
      .describe("Page number where this specific value was found"),
  });

// Example: Insurance schema with per-field citations
const InsuranceSchema = z.object({
  glLimits: CitedValueSchema(z.string().nullable())
    .describe("General Liability limits (e.g., '$1M per occurrence / $2M aggregate')"),
  umbrellaLimits: CitedValueSchema(z.string().nullable())
    .describe("Umbrella/Excess liability limits"),
  autoLimits: CitedValueSchema(z.string().nullable())
    .describe("Auto liability limits"),
  workersCompLimits: CitedValueSchema(z.string().nullable())
    .describe("Workers compensation limits or 'statutory'"),
  coiRequired: CitedValueSchema(z.boolean())
    .describe("Whether Certificate of Insurance is required"),
  additionalInsured: CitedValueSchema(z.boolean())
    .describe("Whether contractor must be named as Additional Insured"),
  waiverOfSubrogation: CitedValueSchema(z.boolean())
    .describe("Whether Waiver of Subrogation is required"),
  primaryNonContributory: CitedValueSchema(z.boolean())
    .describe("Whether Primary & Non-Contributory endorsement required"),
  bondingRequirements: CitedValueSchema(z.string().nullable())
    .describe("Performance/payment bond requirements if any"),
  pageReferences: pageReferencesField,
});
```

### Pattern 4: Storage Schema for Agent Results

**What:** Store extraction results in SQLite with agent name, JSON data, and metadata.

**When to use:** After running agents, before displaying to user.

**Example:**
```typescript
// Source: Existing lib/db/index.ts patterns
import { db } from "@/lib/db";

// Add to lib/db/index.ts schema initialization
db.run(`
  CREATE TABLE IF NOT EXISTS contract_extractions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    agent_name TEXT NOT NULL,
    data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    error_message TEXT,
    duration_ms INTEGER NOT NULL,
    extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contract_id) REFERENCES processed_contracts(id) ON DELETE CASCADE,
    UNIQUE(contract_id, agent_name)
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_contract_extractions_contract ON contract_extractions(contract_id)`);

export function storeAgentResult(
  contractId: number,
  agentName: string,
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

export function getAgentResults(contractId: number): Array<{
  agentName: string;
  data: unknown;
  status: string;
  errorMessage: string | null;
  durationMs: number;
}> {
  const rows = db.query<
    { agent_name: string; data: string; status: string; error_message: string | null; duration_ms: number },
    [number]
  >(
    "SELECT agent_name, data, status, error_message, duration_ms FROM contract_extractions WHERE contract_id = ? ORDER BY agent_name"
  ).all(contractId);

  return rows.map((row) => ({
    agentName: row.agent_name,
    data: JSON.parse(row.data),
    status: row.status,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
  }));
}
```

### Anti-Patterns to Avoid

- **Sequential agent execution:** Running agents one after another wastes time. Use `Promise.allSettled()` for parallel execution.
- **Using `Promise.all()` for agents:** If one agent fails, all results are lost. Use `allSettled()` to preserve partial results.
- **Basic JSON mode without schema:** Schema enforcement at the API level is more reliable than just requesting JSON output.
- **Omitting `.describe()` on schema fields:** The model needs guidance on expected formats (date formats, currency handling).
- **Storing raw LLM text instead of validated JSON:** Always validate with Zod before storing; invalid data causes downstream issues.
- **Temperature > 0 for extraction:** Use `temperature: 0` for deterministic, reproducible extractions.
- **Single monolithic extraction prompt:** Specialized agents perform better than one mega-prompt asking for everything.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema enforcement | Prompt engineering only | Mistral `responseFormat` with Zod | API-level enforcement is more reliable than prompt tricks |
| Parallel execution with error handling | Custom Promise wrapper | `Promise.allSettled()` | Built-in, well-tested, handles all edge cases |
| Type inference from schemas | Manual type definitions | `z.infer<typeof Schema>` | Single source of truth for types and validation |
| LLM retry on validation failure | Manual retry loop | Zod `.safeParse()` + conditional retry | Clean separation of validation and retry logic |
| Date parsing from varied formats | Custom regex | Zod `.transform()` with date parsing | Handles edge cases, normalizes formats |

**Key insight:** Mistral's structured output mode with Zod schemas provides double validation: schema enforcement at generation time (API level) and runtime validation (Zod parse). This combination virtually eliminates malformed outputs.

## Common Pitfalls

### Pitfall 1: LLM Hallucination on Financial Values

**What goes wrong:** Model invents contract values, dates, or permit numbers that look plausible but are incorrect.

**Why it happens:** LLMs are optimized for plausibility, not accuracy. Numbers that "sound right" for contracts may be fabricated.

**How to avoid:**
- Use `temperature: 0` for deterministic extraction
- Include per-field page citations so humans can verify
- Add validation rules in Zod (e.g., contract value must be > 0 if present)
- Flag extractions where page reference is missing

**Warning signs:** Values that don't appear in the source text, round numbers that seem too convenient, dates outside reasonable ranges.

### Pitfall 2: Page Citation Drift

**What goes wrong:** Model cites wrong page numbers or provides citations for hallucinated data.

**Why it happens:** The model may not accurately count page breaks or may confuse similar content across pages.

**How to avoid:**
- Use clear, consistent page break markers (`---PAGE BREAK---`)
- In system prompt, explicitly explain page numbering scheme
- Consider pre-processing text to add explicit `[PAGE 1]`, `[PAGE 2]` markers

**Warning signs:** Cited page numbers exceed document length, multiple conflicting citations for same field.

### Pitfall 3: Schema Mismatch on Nullable Fields

**What goes wrong:** Model returns empty string `""` instead of `null` for missing fields, or vice versa.

**Why it happens:** LLMs may not distinguish between "not found" (null) and "found but empty" ("").

**How to avoid:**
- Use `.nullable()` consistently for optional fields
- In `.describe()`, explicitly state "Use null if not found in document"
- Add `.transform()` to normalize empty strings to null if needed

**Warning signs:** Many empty strings in extraction results, inconsistent null handling across agents.

### Pitfall 4: SOV Table Extraction Corruption

**What goes wrong:** Schedule of Values line items are garbled, merged, or have misaligned columns.

**Why it happens:** Complex tables in contract PDFs may not extract cleanly, especially from OCR.

**How to avoid:**
- Review extracted text from Phase 2 for table quality before agent processing
- Use markdown-formatted OCR output which preserves table structure
- Consider array schema for line items rather than trying to parse a single table string

**Warning signs:** Line item totals don't match contract value, item descriptions appear truncated or merged.

### Pitfall 5: Rate Limiting on Parallel Requests

**What goes wrong:** 7 simultaneous Mistral API calls hit rate limits, causing failures.

**Why it happens:** Mistral has rate limits; 7 parallel calls from same API key may exceed them.

**How to avoid:**
- Monitor rate limit headers in responses
- Consider chunking if needed (e.g., 4 agents, then 3)
- Add exponential backoff retry logic for 429 errors

**Warning signs:** Intermittent 429 errors, some agents succeed while others fail consistently.

## Code Examples

Verified patterns from official sources:

### Initialize Mistral Client (Reusable)

```typescript
// Source: https://github.com/mistralai/client-ts
import { Mistral } from "@mistralai/mistralai";

export function createMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY environment variable is required");
  }
  return new Mistral({ apiKey });
}
```

### Complete Billing Schema Example

```typescript
// Source: Requirements EXTR-02 + Mistral docs
import { z } from "zod";

export const BillingSchema = z.object({
  retentionPercent: z
    .number()
    .nullable()
    .describe("Retention percentage (e.g., 5 or 10), without % symbol"),
  billingPlatform: z
    .enum(["Textura", "Procore", "GCPay", "Premier", "Email", "Other", "Unknown"])
    .describe("Billing/payment platform specified in contract"),
  billingWindow: z
    .string()
    .nullable()
    .describe("Billing cutoff or submission window (e.g., '25th of each month')"),
  billingContact: z
    .object({
      name: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    })
    .nullable()
    .describe("Contact person for billing/AP inquiries"),
  certifiedPayrollRequired: z
    .boolean()
    .describe("Whether certified payroll is required"),
  certifiedPayrollType: z
    .enum(["Davis-Bacon", "HUD", "State Prevailing Wage", "None"])
    .describe("Type of certified payroll if required"),
  pageReferences: z
    .array(z.number().int().positive())
    .describe("Page numbers where billing information was found"),
});

export type BillingInfo = z.infer<typeof BillingSchema>;
```

### Red Flags Detection Schema

```typescript
// Source: Requirements EXTR-07
import { z } from "zod";

export const RedFlagSchema = z.object({
  unusualTerms: z
    .array(
      z.object({
        term: z.string().describe("The unusual or concerning contract term"),
        concern: z.string().describe("Why this term is flagged as unusual"),
        pageRef: z.number().int().positive().describe("Page where found"),
      })
    )
    .describe("Unusual or potentially unfavorable contract terms"),
  maintenanceLanguage: z
    .object({
      found: z.boolean(),
      description: z.string().nullable(),
      pageRef: z.number().int().positive().nullable(),
    })
    .describe("Whether contract includes maintenance/warranty obligations beyond standard"),
  tmLanguage: z
    .object({
      found: z.boolean(),
      description: z.string().nullable(),
      pageRef: z.number().int().positive().nullable(),
    })
    .describe("Whether contract includes Time & Materials provisions"),
  vagueLanguage: z
    .array(
      z.object({
        phrase: z.string(),
        concern: z.string(),
        pageRef: z.number().int().positive(),
      })
    )
    .describe("Vague or ambiguous language that could be problematic"),
  missingInfo: z
    .array(z.string())
    .describe("Standard contract elements that appear to be missing"),
  overallRiskLevel: z
    .enum(["low", "medium", "high"])
    .describe("Overall risk assessment based on red flags found"),
  pageReferences: z
    .array(z.number().int().positive())
    .describe("All pages referenced in this analysis"),
});

export type RedFlagsInfo = z.infer<typeof RedFlagSchema>;
```

### Full Agent Implementation

```typescript
// Source: Combines Mistral docs + codebase patterns
import { z } from "zod";
import type { Mistral } from "@mistralai/mistralai";
import { BillingSchema, type BillingInfo } from "../schemas/billing";

const SYSTEM_PROMPT = `You are a contract analysis expert specializing in construction subcontracts.
Extract billing and payment information from the provided contract document.

IMPORTANT INSTRUCTIONS:
1. Only extract information explicitly stated in the document
2. Use null for any field where information is not found
3. For pageReferences, cite the page number(s) where you found the information
4. Pages are separated by "---PAGE BREAK---" markers. Page 1 is the content before the first marker.
5. Do not invent or assume information not present in the document`;

export async function extractBilling(
  fullText: string,
  mistral: Mistral
): Promise<BillingInfo> {
  const response = await mistral.chat.parse({
    model: "mistral-large-latest",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: fullText },
    ],
    responseFormat: BillingSchema,
    maxTokens: 1024,
    temperature: 0,
  });

  // Double-validate with Zod (belt and suspenders)
  const parsed = BillingSchema.safeParse(response.choices[0].message.parsed);
  if (!parsed.success) {
    throw new Error(`Billing extraction validation failed: ${parsed.error.message}`);
  }

  return parsed.data;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex/rule-based extraction | LLM structured output | 2024-2025 | Handles varied contract formats without custom rules |
| JSON mode + manual parse | Zod schema in responseFormat | 2025 | API-level schema enforcement + runtime validation |
| Sequential LLM calls | Parallel with allSettled | Always best practice | 7x faster extraction pipeline |
| Single extraction prompt | Specialized agents | 2024-2025 | Better accuracy per domain, easier debugging |
| Document-level citation | Field-level citation | 2025-2026 | Precise human verification, audit trail |

**Deprecated/outdated:**
- **JSON mode without schema:** Less reliable than structured output with schema
- **GPT function calling for extraction:** Structured output is cleaner for pure extraction
- **Instructor library:** Mistral SDK now has native `chat.parse()` support

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal model selection for extraction**
   - What we know: `mistral-large-latest` supports structured output, high accuracy
   - What's unclear: Whether `ministral-8b-latest` is sufficient for extraction (cheaper, faster)
   - Recommendation: Start with `mistral-large-latest`, benchmark accuracy, consider ministral if cost becomes an issue

2. **Rate limit headroom for 7 parallel agents**
   - What we know: Mistral has rate limits per API key
   - What's unclear: Exact limits for current tier, whether 7 parallel calls are safe
   - Recommendation: Implement graceful retry with backoff; monitor for 429 errors in production

3. **Page reference accuracy verification**
   - What we know: Model provides page citations in output
   - What's unclear: How accurate these citations are in practice
   - Recommendation: Add post-extraction verification that checks if cited pages contain relevant keywords

4. **SOV extraction for complex tables**
   - What we know: Phase 2 OCR preserves table structure in markdown
   - What's unclear: How well LLM extraction handles multi-page SOV tables
   - Recommendation: Implement SOV as array of line items; handle gracefully if extraction incomplete

## Sources

### Primary (HIGH confidence)
- [Mistral Custom Structured Output Documentation](https://docs.mistral.ai/capabilities/structured_output/custom) - API reference, TypeScript examples
- [Mistral JSON Mode Documentation](https://docs.mistral.ai/capabilities/structured_output/json_mode) - Response format configuration
- [Mistral TypeScript SDK](https://github.com/mistralai/client-ts) - Official SDK, chat.parse method
- [Zod Documentation](https://zod.dev/) - Schema definition, safeParse, describe
- [MDN Promise.allSettled](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled) - Parallel execution pattern

### Secondary (MEDIUM confidence)
- [Stop Parsing LLMs with Regex - DEV Community](https://dev.to/dthompsondev/llm-structured-json-building-production-ready-ai-features-with-schema-enforced-outputs-4j2j) - Schema-enforced outputs best practices
- [LLM-Based Document Extraction Patterns](https://landing.ai/developers/going-beyond-ocrllm-introducing-agentic-document-extraction) - Agentic extraction with citation tracking
- [Unstract LLM PDF Extraction](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/) - Hallucination prevention strategies

### Tertiary (LOW confidence)
- [Exploring LLM Citation Generation](https://medium.com/@prestonblckbrn/exploring-llm-citation-generation-in-2025-4ac7c8980794) - Citation tracking patterns
- [Cradl AI Hallucination-Free Extraction](https://www.cradl.ai/post/hallucination-free-llm-data-extraction) - LLM challenge approach for verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Mistral SDK documented, Zod well-established, patterns verified
- Architecture: HIGH - Parallel execution is standard practice, storage follows existing codebase patterns
- Pitfalls: MEDIUM - Based on documented LLM extraction challenges, some specifics from community sources

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - Mistral structured output is stable, Zod is mature)

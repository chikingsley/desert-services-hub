# Phase 4: Estimate Matching - Research

**Researched:** 2026-01-23
**Domain:** Fuzzy string matching, Monday.com integration, confidence-based auto-linking
**Confidence:** HIGH

## Summary

Phase 4 implements fuzzy matching between extracted contract data and Monday.com ESTIMATING board items. The goal is to link incoming contracts to their original estimates automatically when confidence is high (>0.8) and present top candidates for human selection when confidence is low.

The existing codebase already has substantial infrastructure for this:

1. **Monday client** (`services/monday/client.ts`) with `findBestMatches()` and `calculateSimilarity()` functions
2. **MCP server** (`services/monday/mcp-server.ts`) exposing `find_best_matches` tool
3. **Contract-match skill** (`.claude/skills/contract-match/SKILL.md`) defining the matching workflow
4. **Contract-match agent** (`.claude/agents/contract-match-agent.md`) for parallel search strategies

The current `calculateSimilarity()` function uses a word-overlap algorithm which is adequate for project name matching but could be enhanced. The key architectural decision is whether to enhance the existing algorithm or add a dedicated fuzzy matching library. Given the existing patterns work for the codebase and the domain (construction project names like "AMS Mesa", "Paradise Valley Site"), enhancing the existing algorithm with contractor matching is the recommended approach.

**Primary recommendation:** Extend the existing `findBestMatches()` function to accept both project name AND contractor name, combining their similarity scores with configurable weights. Use the 0.8 threshold for auto-selection, present top 3-5 for manual selection below that.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| services/monday/client.ts | existing | Fuzzy matching, API calls | Already implements `findBestMatches()` and `calculateSimilarity()` |
| services/monday/types.ts | existing | Board IDs, column definitions | ESTIMATING board ID and CONTRACTOR column defined |
| bun:sqlite | built-in | Match result caching | Consistent with Phase 1-3 patterns |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| MCP server | existing | Claude integration | For manual matching workflow via `/contract-match` skill |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom word-overlap algorithm | Fuse.js | Fuse.js adds dependency, overkill for short project names; existing algorithm works well |
| Custom word-overlap algorithm | string-similarity (Dice coefficient) | Library is unmaintained (archived 2023); don't add new dependencies on dead projects |
| Enhance existing algorithm | Levenshtein distance | Levenshtein is character-based; word-overlap better for construction names with abbreviations |
| Single-field matching | Multi-field weighted scoring | Multi-field (project + contractor) increases accuracy significantly |

**Installation:**

```bash
# No new dependencies needed - all functionality exists
```

## Architecture Patterns

### Recommended Project Structure

```
services/
  contract/
    matching/                    # NEW: Estimate matching module
      matcher.ts                 # findEstimateMatch() - main entry point
      scorer.ts                  # Multi-field similarity scoring
      types.ts                   # MatchResult, MatchCandidate types
      storage.ts                 # Store match decisions in SQLite
  monday/
    client.ts                    # EXISTING: findBestMatches(), calculateSimilarity()
    mcp-server.ts                # EXISTING: find_best_matches tool
```

### Pattern 1: Multi-Field Weighted Scoring

**What:** Combine similarity scores from multiple fields (project name, contractor) with configurable weights to produce a single confidence score.

**When to use:** Every match attempt between contract and estimate.

**Example:**

```typescript
// Source: Derived from existing calculateSimilarity() + requirements
import { calculateSimilarity } from "@/services/monday/client";

const WEIGHTS = {
  projectName: 0.6,    // Project name is primary signal
  contractor: 0.4,     // Contractor adds confirmation
} as const;

const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const LOW_CONFIDENCE_THRESHOLD = 0.3;

type MatchCandidate = {
  itemId: string;
  itemName: string;
  itemUrl: string;
  projectScore: number;
  contractorScore: number;
  combinedScore: number;
  matchDetails: {
    estimateContractor: string | null;
    searchedProjectName: string;
    searchedContractor: string;
  };
};

function calculateMatchScore(
  contractProjectName: string,
  contractContractor: string,
  estimateName: string,
  estimateContractor: string | null
): { projectScore: number; contractorScore: number; combinedScore: number } {
  const projectScore = calculateSimilarity(contractProjectName, estimateName);

  // If no contractor in estimate, use project score only
  const contractorScore = estimateContractor
    ? calculateSimilarity(contractContractor, estimateContractor)
    : 0;

  // Weighted combination
  const combinedScore = estimateContractor
    ? projectScore * WEIGHTS.projectName + contractorScore * WEIGHTS.contractor
    : projectScore;  // If no contractor data, use project name only

  return { projectScore, contractorScore, combinedScore };
}
```

### Pattern 2: Tiered Confidence Response

**What:** Return different response types based on confidence score thresholds.

**When to use:** When determining whether to auto-select or present options.

**Example:**

```typescript
// Source: Derived from requirements MATCH-03, MATCH-04
type MatchResult =
  | { status: "auto_matched"; estimate: MatchCandidate }
  | { status: "needs_selection"; candidates: MatchCandidate[] }
  | { status: "no_match"; searchDetails: SearchDetails };

const MAX_CANDIDATES = 5;

async function findEstimateMatch(
  contractInfo: { projectName: string; generalContractor: string }
): Promise<MatchResult> {
  const candidates = await searchAndScore(contractInfo);

  if (candidates.length === 0) {
    return {
      status: "no_match",
      searchDetails: {
        searchedProject: contractInfo.projectName,
        searchedContractor: contractInfo.generalContractor,
        totalItemsSearched: /* board count */
      }
    };
  }

  const topCandidate = candidates[0];

  if (topCandidate.combinedScore >= HIGH_CONFIDENCE_THRESHOLD) {
    return { status: "auto_matched", estimate: topCandidate };
  }

  // Return top candidates for human selection
  return {
    status: "needs_selection",
    candidates: candidates.slice(0, MAX_CANDIDATES)
  };
}
```

### Pattern 3: Parallel Search Strategy

**What:** Run multiple search strategies in parallel and merge results.

**When to use:** When searching Monday board for matches.

**Example:**

```typescript
// Source: Existing contract-match-agent.md pattern
import { findBestMatches, searchItems, getItemsRich } from "@/services/monday/client";
import { BOARD_IDS } from "@/services/monday/types";

async function searchAndScore(
  contractInfo: { projectName: string; generalContractor: string }
): Promise<MatchCandidate[]> {
  const boardId = BOARD_IDS.ESTIMATING;

  // Run searches in parallel
  const [
    projectMatches,
    contractorMatches,
  ] = await Promise.all([
    findBestMatches(boardId, contractInfo.projectName, 10),
    searchItems(boardId, contractInfo.generalContractor.split(" ")[0]),
  ]);

  // Merge results, removing duplicates by ID
  const uniqueIds = new Set<string>();
  const candidates: MatchCandidate[] = [];

  for (const item of [...projectMatches, ...contractorMatches]) {
    if (uniqueIds.has(item.id)) continue;
    uniqueIds.add(item.id);

    // Fetch contractor from CONTRACTOR column (mirror/relation)
    const estimateContractor = item.columns["deal_account"] ?? null;

    const scores = calculateMatchScore(
      contractInfo.projectName,
      contractInfo.generalContractor,
      item.name,
      estimateContractor
    );

    candidates.push({
      itemId: item.id,
      itemName: item.name,
      itemUrl: item.url,
      ...scores,
      matchDetails: {
        estimateContractor,
        searchedProjectName: contractInfo.projectName,
        searchedContractor: contractInfo.generalContractor,
      },
    });
  }

  // Sort by combined score descending
  return candidates.sort((a, b) => b.combinedScore - a.combinedScore);
}
```

### Pattern 4: Match Result Storage

**What:** Store match decisions (auto and manual) in SQLite for audit trail and linking.

**When to use:** After a match is confirmed (auto or human-selected).

**Example:**

```typescript
// Source: Existing lib/db/index.ts patterns
import { db } from "@/lib/db";

// Schema for contract_matches table
db.run(`
  CREATE TABLE IF NOT EXISTS contract_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    estimate_item_id TEXT NOT NULL,
    estimate_item_name TEXT NOT NULL,
    match_type TEXT NOT NULL CHECK(match_type IN ('auto', 'manual')),
    confidence_score REAL NOT NULL,
    matched_at TEXT NOT NULL DEFAULT (datetime('now')),
    matched_by TEXT,  -- NULL for auto, user identifier for manual
    FOREIGN KEY (contract_id) REFERENCES processed_contracts(id) ON DELETE CASCADE,
    UNIQUE(contract_id)
  )
`);

type MatchType = "auto" | "manual";

function storeMatchResult(
  contractId: number,
  estimate: MatchCandidate,
  matchType: MatchType,
  matchedBy: string | null
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO contract_matches
    (contract_id, estimate_item_id, estimate_item_name, match_type, confidence_score, matched_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    contractId,
    estimate.itemId,
    estimate.itemName,
    matchType,
    estimate.combinedScore,
    matchedBy
  );
}
```

### Anti-Patterns to Avoid

- **Single-field matching only:** Using project name alone misses opportunities to confirm with contractor. Always use multi-field scoring when contractor data is available.
- **Binary matching (match/no-match):** Construction names vary too much. Use confidence scores and thresholds for nuanced decisions.
- **Hard-coded thresholds everywhere:** Define thresholds as constants at the top of the module for easy tuning.
- **Fetching all items then filtering in memory:** The ESTIMATING board may have thousands of items. Use `findBestMatches()` which filters server-side first, then scores in memory.
- **Ignoring the "Shell Estimates" group:** The existing client excludes this group by default. Don't override this unless explicitly needed.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy string matching | Custom Levenshtein | Existing `calculateSimilarity()` | Already tuned for project names, handles abbreviations |
| Monday API pagination | Manual cursor handling | Existing `getItems()` | Auto-paginates, handles rate limits |
| Board relation lookups | Manual GraphQL queries | `getItemsRich()` | Fetches linked item data including contractor mirror |
| MCP tool exposure | New server implementation | Extend existing `mcp-server.ts` | Consistent patterns, already registered in Claude |

**Key insight:** The existing Monday client has sophisticated fuzzy matching that works well for construction project names. The primary enhancement needed is multi-field scoring (project + contractor) rather than replacing the algorithm.

## Common Pitfalls

### Pitfall 1: Contractor Name Variations

**What goes wrong:** Contract says "BC Construction Group" but Monday has "BCCG" or "BC Construction".

**Why it happens:** Contractors often use different name variations (legal name vs. DBA, abbreviations, etc.).

**How to avoid:**

- Use word-overlap similarity, not exact matching
- Score contractor match separately and use as confirmation signal, not primary filter
- Consider first-word matching as fallback (e.g., "BC" matches "BC Construction Group")

**Warning signs:** Low contractor scores even when project names match well.

### Pitfall 2: Project Name Abbreviations

**What goes wrong:** Contract says "American Management Services - Mesa" but estimate is "AMS Mesa".

**Why it happens:** Estimators use abbreviations; contracts use full legal names.

**How to avoid:**

- The existing word-overlap algorithm handles this by matching individual words
- "Mesa" matches across both, giving partial similarity
- Consider adding common abbreviation mappings if this becomes a frequent issue

**Warning signs:** Many near-misses where human can clearly see the match but algorithm scores low.

### Pitfall 3: Auto-Match Threshold Too Low

**What goes wrong:** System auto-links contracts to wrong estimates, requiring manual correction.

**Why it happens:** Threshold set too low to avoid manual selection, but results in incorrect matches.

**How to avoid:**

- Start with conservative 0.8 threshold for auto-match
- Log all auto-matches with full details for review
- Track false positive rate and adjust threshold based on data
- Better to require human confirmation than link incorrectly

**Warning signs:** Users reporting incorrectly linked contracts.

### Pitfall 4: Missing Contractor Data in Monday

**What goes wrong:** ESTIMATING items don't have contractor populated, so multi-field scoring degrades.

**Why it happens:** Data entry inconsistency in Monday.com; some estimates lack contractor info.

**How to avoid:**

- Check if contractor field is populated before including in score
- Fall back to project-name-only scoring when contractor missing
- Flag matches made without contractor confirmation

**Warning signs:** Many estimates returning null contractor in `deal_account` column.

### Pitfall 5: Rate Limiting on Board Fetch

**What goes wrong:** Fetching all ESTIMATING items for matching hits Monday API rate limits.

**Why it happens:** Large boards with thousands of items; multiple searches in quick succession.

**How to avoid:**

- The existing `getItems()` auto-paginates with PAGE_SIZE=500
- Consider caching board items with short TTL (5 minutes) if doing many matches
- Use `findBestMatches()` which pre-filters using name search before scoring

**Warning signs:** 429 errors from Monday API, intermittent match failures.

## Code Examples

Verified patterns from official sources and existing codebase:

### Complete Matcher Implementation

```typescript
// Source: Combining existing client.ts patterns with requirements
import {
  findBestMatches,
  searchItems,
  calculateSimilarity,
  type ScoredItem
} from "@/services/monday/client";
import { BOARD_IDS } from "@/services/monday/types";
import { db } from "@/lib/db";

// Configuration
const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const MIN_CONFIDENCE_THRESHOLD = 0.3;
const MAX_CANDIDATES = 5;
const WEIGHTS = { projectName: 0.6, contractor: 0.4 } as const;

// Types
export type MatchCandidate = {
  itemId: string;
  itemName: string;
  itemUrl: string;
  projectScore: number;
  contractorScore: number;
  combinedScore: number;
  estimateContractor: string | null;
};

export type MatchResult =
  | { status: "auto_matched"; estimate: MatchCandidate; confidence: number }
  | { status: "needs_selection"; candidates: MatchCandidate[]; topConfidence: number }
  | { status: "no_match"; reason: string };

// Main entry point
export async function findEstimateMatch(
  contractProjectName: string,
  contractContractor: string
): Promise<MatchResult> {
  const boardId = BOARD_IDS.ESTIMATING;

  // Parallel search: project name fuzzy + contractor keyword
  const [projectMatches, contractorMatches] = await Promise.all([
    findBestMatches(boardId, contractProjectName, 10),
    searchItems(boardId, contractContractor.split(" ")[0]), // First word
  ]);

  // Merge and dedupe
  const seenIds = new Set<string>();
  const allItems: ScoredItem[] = [];

  for (const item of [...projectMatches, ...contractorMatches]) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      allItems.push(item);
    }
  }

  if (allItems.length === 0) {
    return {
      status: "no_match",
      reason: `No estimates found matching "${contractProjectName}" or "${contractContractor}"`
    };
  }

  // Score with multi-field algorithm
  const candidates: MatchCandidate[] = allItems
    .map(item => {
      const estimateContractor = item.columns?.["deal_account"] ?? null;
      const projectScore = calculateSimilarity(contractProjectName, item.name);
      const contractorScore = estimateContractor
        ? calculateSimilarity(contractContractor, estimateContractor)
        : 0;

      const combinedScore = estimateContractor
        ? projectScore * WEIGHTS.projectName + contractorScore * WEIGHTS.contractor
        : projectScore;

      return {
        itemId: item.id,
        itemName: item.name,
        itemUrl: item.url,
        projectScore,
        contractorScore,
        combinedScore,
        estimateContractor,
      };
    })
    .filter(c => c.combinedScore >= MIN_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.combinedScore - a.combinedScore);

  if (candidates.length === 0) {
    return {
      status: "no_match",
      reason: "Found items but none met minimum confidence threshold"
    };
  }

  const topCandidate = candidates[0];

  if (topCandidate.combinedScore >= HIGH_CONFIDENCE_THRESHOLD) {
    return {
      status: "auto_matched",
      estimate: topCandidate,
      confidence: topCandidate.combinedScore,
    };
  }

  return {
    status: "needs_selection",
    candidates: candidates.slice(0, MAX_CANDIDATES),
    topConfidence: topCandidate.combinedScore,
  };
}
```

### Link Contract to Estimate in Monday

```typescript
// Source: Existing client.ts updateItem pattern
import { updateItem } from "@/services/monday/client";
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@/services/monday/types";

export async function linkContractToEstimate(
  estimateItemId: string,
  contractFileId: string // Monday file column ID after upload
): Promise<void> {
  // Update the CONTRACTS file column on the estimate
  await updateItem({
    boardId: BOARD_IDS.ESTIMATING,
    itemId: estimateItemId,
    columnValues: {
      [ESTIMATING_COLUMNS.CONTRACTS.id]: contractFileId,
    },
  });
}
```

### Human Selection Interface Data

```typescript
// Source: Requirements MATCH-04
type SelectionOption = {
  index: number;
  itemId: string;
  itemName: string;
  confidence: string; // e.g., "75%"
  matchReasons: string[];
  url: string;
};

function formatCandidatesForSelection(
  candidates: MatchCandidate[]
): SelectionOption[] {
  return candidates.map((c, i) => ({
    index: i + 1,
    itemId: c.itemId,
    itemName: c.itemName,
    confidence: `${Math.round(c.combinedScore * 100)}%`,
    matchReasons: [
      `Project name similarity: ${Math.round(c.projectScore * 100)}%`,
      c.estimateContractor
        ? `Contractor similarity: ${Math.round(c.contractorScore * 100)}%`
        : "No contractor data in estimate",
    ],
    url: c.itemUrl,
  }));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual lookup in Monday | Fuzzy matching with auto-select | 2025 | Reduces manual work for high-confidence matches |
| Single-field matching | Multi-field weighted scoring | 2025 | Improves accuracy with contractor confirmation |
| Binary match/no-match | Confidence-based tiered response | 2025 | Appropriate human involvement based on certainty |
| Sequential searches | Parallel search strategies | Always best practice | Faster matching, better coverage |

**Deprecated/outdated:**

- **string-similarity npm package:** Archived in 2023, no longer maintained. Use existing `calculateSimilarity()` instead.
- **Full Levenshtein implementation:** Character-level edit distance is less suitable for construction project names with abbreviations.

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal weight distribution for project name vs. contractor**
   - What we know: Both signals are valuable; project name is primary
   - What's unclear: Exact optimal weights (60/40 vs. 70/30)
   - Recommendation: Start with 60/40, track match accuracy, adjust based on data

2. **Handling multiple high-confidence matches**
   - What we know: Sometimes two estimates may score > 0.8
   - What's unclear: Business rule for this edge case
   - Recommendation: If multiple candidates exceed threshold, still present for human selection with explanation

3. **Contract amount as additional matching signal**
   - What we know: Phase 3 extracts contract value; estimates have bid values
   - What's unclear: How much weight to give amount matching
   - Recommendation: Could add as third signal in future if name+contractor insufficient

## Sources

### Primary (HIGH confidence)

- Existing codebase: `services/monday/client.ts` - `calculateSimilarity()`, `findBestMatches()` implementation
- Existing codebase: `services/monday/mcp-server.ts` - `find_best_matches` tool definition
- Existing codebase: `.claude/skills/contract-match/SKILL.md` - Matching workflow
- Existing codebase: `services/monday/types.ts` - BOARD_IDS, ESTIMATING_COLUMNS

### Secondary (MEDIUM confidence)

- [Fuse.js Documentation](https://www.fusejs.io/) - Fuzzy search patterns, threshold configuration
- [String Similarity Algorithms](https://medium.com/@appaloosastore/string-similarity-algorithms-compared-3f7b4d12f0ff) - Algorithm comparison

### Tertiary (LOW confidence)

- [string-similarity GitHub](https://github.com/aceakash/string-similarity) - Archived project, Dice coefficient reference only

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All components already exist in codebase
- Architecture: HIGH - Extends existing patterns with proven Monday client
- Pitfalls: MEDIUM - Based on construction industry domain knowledge + existing skills documentation

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - Monday API is stable, existing patterns are proven)

---
description: Read a contract PDF and find the matching estimate in Monday. Use when user has a contract file and needs to find the related estimate.
user_invocable: true
---

# Contract Match Skill

Read a contract PDF and find the matching estimate in Monday CRM.

## When to Use

- User says "find the estimate for this contract"
- User has a contract PDF and wants to match it to Monday
- User says "match this contract" or "contract match"
- User drops a contract file and asks about the estimate

## Workflow

### 1. Read the Contract PDF

Use the Read tool to read the contract PDF. Extract these key fields:

- **Project Name** - The project/job name (e.g., "AMS Mesa", "Paradise Valley Site")
- **Contractor/Client** - Who the contract is with (e.g., "BC Construction Group")
- **Contract Amount** - Total value
- **Job Number** - Any reference numbers (e.g., "24-057")
- **Address** - Project site address
- **Scope** - What services are included (SWPPP, Dust, Temp Fence, etc.)

### 2. Search Monday ESTIMATING Board

Spawn a subagent to search Monday using multiple strategies in parallel:

```typescript
// Strategy 1: Project name search
mcp__desert-mondaycrm__find_best_matches({
  boardId: "ESTIMATING",
  name: "{project name}",
  limit: 5
})

// Strategy 2: Contractor/account search
mcp__desert-mondaycrm__search_items({
  boardId: "ESTIMATING",
  searchTerm: "{contractor name}"
})

// Strategy 3: Address search (if available)
mcp__desert-mondaycrm__search_items({
  boardId: "ESTIMATING",
  searchTerm: "{street or city from address}"
})

// Strategy 4: Job number search
mcp__desert-mondaycrm__search_items({
  boardId: "ESTIMATING",
  searchTerm: "{job number}"
})
```

### 3. Evaluate Results

For each match found, check:
- Does the project name fuzzy-match?
- Does the contractor/account match?
- Is the amount close to the contract value?
- Does the scope align?

Score matches:
- **High confidence**: 2+ fields match
- **Medium confidence**: 1 field matches, close amount
- **Low confidence**: Only fuzzy name match

### 4. Report Results

Output a summary:

**Contract Details:**
- Project: {name}
- Contractor: {name}
- Amount: ${value}
- Address: {address}

**Best Match(es) in Monday:**
- {Item name} (ID: {id}) - {confidence level}
  - Amount: ${estimate value}
  - Contractor: {account}
  - Match reason: {why it matched}

**If no match:** List what was searched and suggest manual lookup.

## Subagent Instructions

When spawning the contract-match-agent, provide:

```
Search Monday ESTIMATING board for estimate matching:
- Project: {extracted project name}
- Contractor: {extracted contractor}
- Amount: ${amount}
- Address: {address}
- Job #: {job number if found}

Run ALL search strategies in parallel and compile results.
```

## Example

**Input:** Contract PDF for "AMS Mesa" with BC Construction Group, $17,845

**Searches run:**
1. `find_best_matches("AMS Mesa")`
2. `search_items("BC Construction")`
3. `search_items("Mesa")` or `search_items("221 W 6th")`

**Output:** Found estimate "AMS - MESA" (ID: 12345) - High confidence match, amount $17,845 matches exactly.

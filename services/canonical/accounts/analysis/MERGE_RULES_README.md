# Contractor Data Merge Rules

This directory contains comprehensive rules for automatically merging and deduplicating contractor data across multiple data sources.

## Files

- **merge_rules.json** - The complete rule set for contractor name matching and merging
- **accounts.csv** - Canonical (authoritative) contractor list with normalized names
- **accounts_smart.csv** - Smart-grouped contractors using fuzzy matching
- **ar_mays_variants.csv** - Example: All variants of "AR Mays" found in data
- **willmeng_variants.csv** - Example: All variants of "Willmeng" found in data

## Overview

Contractor names appear in multiple forms across different data sources:
- Different legal suffixes (Inc, LLC, Corp, Co, Company, etc.)
- Different formatting (spaces, hyphens, punctuation)
- Different capitalization (mixed case, all caps)
- Typos and misspellings
- Abbreviated vs. full names
- Regional office variations

The merge rules standardize these variations into canonical contractor records.

## Quick Start

### 1. Understanding Suffix Variations

All of these should merge into the same contractor:

```
Willmeng
Willmeng Inc
Willmeng LLC
Willmeng Corporation
Willmeng Co
Willmeng Company
```

**Rule from merge_rules.json:**
```json
{
  "pattern": "X",
  "equivalents": ["X Inc", "X Inc.", "X LLC", "X LLC.", ..., "X Company"],
  "description": "Legal entity suffixes are interchangeable for matching"
}
```

### 2. Understanding Industry-Specific Suffixes

These variations should all merge:

```
Willmeng
Willmeng Construction
Willmeng Contractors
Willmeng Builders
Willmeng Building
```

**Rule from merge_rules.json:**
```json
{
  "pattern": "X",
  "equivalents": ["X Construction", "X Contractors", "X Builders", ...],
  "description": "Industry-specific suffixes that indicate same company"
}
```

### 3. Handling Common Misspellings

Construction industry has predictable typos:

```
"contruction"  → "construction"
"constuction"  → "construction"
"constraction" → "construction"
```

**Implementation:** Check `typo_rules.common_construction_misspellings` before matching.

### 4. Using Known Aliases

For companies with many recorded variants, use the `known_aliases` list:

```json
{
  "canonical": "AR Mays",
  "display_name": "AR Mays",
  "aliases": ["armays", "ARMAYS", "AR MAYS", "A.R. Mays", ...],
  "record_count": 237,
  "confidence": "very_high"
}
```

**Example variations found in data:**
- AR Mays (718 records) - canonical
- armays (56 records)
- ARMAYS (48 records)
- AR MAYS (24 records)
- A.R. Mays (12 records)
- A.R. MAYS (9 records)
- AR MAys (2 records)
- etc.

All merge under: **AR Mays**

## Merge Strategy (10-Step Process)

The merge_rules.json file specifies a 10-step process:

### Step 1: Normalize Whitespace
- Trim leading/trailing spaces
- Collapse multiple spaces to single space
- No spaces before punctuation

### Step 2: Normalize Case
- Convert to lowercase for comparison
- Preserve title case in display names
- Handle acronyms specially

### Step 3: Remove Punctuation
- Remove dots in abbreviations (A.R. → AR)
- Convert hyphens/commas as needed
- Preserve core punctuation (hyphens in names)

### Step 4: Remove Suffixes
Regex pattern from `smart-normalize.ts`:
```regex
/,?\s*(inc\.?|llc\.?|corp\.?|co\.?|company|corporation|l\.l\.c\.?|
incorporated|construction|builders?|contracting|contractor|
general\s*contractors?|development|enterprises?|services?|
group|holdings?)\.?$/gi
```

Removes: Inc, LLC, Corp, Co, Company, Construction, Contractors, Builders, etc.

### Step 5: Extract Embedded Content
Remove or extract to separate fields:
- Job numbers: "Willmeng (Job 12345)" → "Willmeng" + job_id: 12345
- Contact info: "willmeng@example.com" → extract to contact field
- Notes: "Willmeng (Need PO)" → extract to notes field

### Step 6: Check Exclude Patterns
Some similar names are actually different:
- "Core" should NOT match "Hardcore"
- Very short names need special handling
- Generic prefixes (Desert, Phoenix, Arizona) need context

### Step 7: Apply Known Aliases
Direct lookup against the `known_aliases` list.

### Step 8: Fuzzy Match (if needed)
If not in known_aliases, use fuzzy matching with high threshold:
- Word boundary matches only
- Minimum 50% string length overlap
- Minimum 6 characters

### Step 9: Select Canonical Form
Choose canonical based on:
1. Most common spelling in dataset (by record count)
2. Title case formatting
3. Most professional/complete version

### Step 10: Merge Records
Combine all duplicate records, maintaining:
- Audit trail of original variants
- Record counts and sources
- Link mappings for data integrity

## Confidence Levels

### Very High (≥95%) - Automatic Merge
- Exact match after normalization
- Name in known_aliases list
- Obvious typo corrections
- Suffix variations
- Example: "WILLMENG" → "Willmeng"

### High (≥85%) - Merge with Review
- Substring matching with word boundary
- Known company with multiple sources
- Acronym expansion matches
- Example: "Willmeng Construction" → "Willmeng"

### Medium (70-84%) - Flag for Manual Review
- Fuzzy match above 70%
- Single source entries
- Potential name conflicts
- Example: Edge cases, ambiguous matches

### Low (<70%) - Do Not Merge
- Generic single words
- Potential homonyms
- Unconfirmed regional variants
- Example: "Core" without additional context

## Real-World Examples

### Example 1: AR Mays Variants

**Raw data found:**
```
AR Mays (718)        → Canonical
armays (56)
ARMAYS (48)
AR MAYS (24)
A.R. Mays (12)
A.R. MAYS (9)
```

**Normalization process:**
1. Whitespace: "A.R. MAYS" → "A.R. MAYS"
2. Case: "A.R. MAYS" → "a.r. mays"
3. Punctuation: "a.r. mays" → "ar mays"
4. Suffixes: "ar mays" (no change)
5. Embedded: (no change)
6. Exclude patterns: (pass)
7. Known aliases: MATCH → "AR Mays"
8. Result: Merge to canonical "AR Mays"

**Confidence:** Very High (95%+)

### Example 2: Willmeng Variants

**Raw data found:**
```
Willmeng (247)                    → Keep
Willmeng Construction (224)       → Merge
WILLMENG (93)                     → Merge
WILLMENG CONSTRUCTION INC (31)    → Merge
willmeng@willmeng.com (46)        → Extract contact info
```

**Result:** All merge under "Willmeng" (canonical)
**Total records:** ~600 records consolidated to 1 entry

### Example 3: Chasse Building Team

**Raw data found:**
```
Chasse Building Team (205)  → Canonical
Chasse (31)                 → Merge
Chasse Building (54)        → Merge
CHASSE (1)                  → Merge
```

**Result:** All merge under "Chasse Building Team"

## Things That Should NOT Merge

### 1. Core Construction vs Hardcore Construction
- "core" is a substring of "hardcore"
- But they're different companies
- Solution: Require word boundary match

### 2. Different Regional Offices
- Some companies have true separate entities
- Requires additional context to confirm merge
- Solution: Verify through external sources

### 3. Generic Prefixes
- "Desert", "Phoenix", "Arizona", "American", etc.
- Too many unrelated companies use these
- Solution: Require specific other identifying information

### 4. Single-Word Names
- Names under 4 characters are typically abbreviations
- High risk of false positives
- Solution: Require additional context or manual confirmation

## Implementation Guide

### For Python

```python
import json

with open('merge_rules.json') as f:
    rules = json.load(f)

# Access suffix rules
for rule in rules['suffix_rules']:
    pattern = rule['pattern']
    equivalents = rule['equivalents']

# Access known aliases
for alias_group in rules['known_aliases']['comprehensive_list']:
    canonical = alias_group['canonical']
    aliases = alias_group['aliases']
```

### For JavaScript/TypeScript

```typescript
import mergeRules from './merge_rules.json';

// Apply normalization
function normalize(name: string): string {
  let n = name.toLowerCase().trim();

  // Remove suffixes using the rules
  for (const rule of mergeRules.suffix_rules) {
    // Apply pattern
  }

  return n;
}

// Check known aliases
function findCanonical(normalized: string): string | null {
  for (const group of mergeRules.known_aliases.comprehensive_list) {
    if (group.aliases.includes(normalized)) {
      return group.canonical;
    }
  }
  return null;
}
```

### For SQL

Use the canonical name as foreign key:

```sql
-- Original data has many duplicates
SELECT contractor_name, COUNT(*) FROM projects
GROUP BY contractor_name
ORDER BY COUNT(*) DESC;

-- After merge using rules
SELECT canonical_contractor_id, COUNT(*) FROM projects
GROUP BY canonical_contractor_id
ORDER BY COUNT(*) DESC;
```

## Extending the Rules

When encountering new contractors:

1. **Add to known_aliases if company has 20+ records**
   ```json
   {
     "canonical": "New Company Name",
     "display_name": "New Company Name",
     "aliases": ["variant1", "variant2"],
     "record_count": 150,
     "confidence": "very_high"
   }
   ```

2. **Add typos if pattern repeats across multiple companies**
   ```json
   {
     "misspelling": "misspeled_word",
     "correct": "correct_word",
     "frequency": "medium"
   }
   ```

3. **Add to exclude_patterns if false positive occurs**
   ```json
   {
     "pattern": "Company A vs Company B",
     "reason": "completely different companies",
     "rule": "require_context"
   }
   ```

## Data Quality Checks

Before merging, verify:

1. **No false positives** - All merged names are actually the same company
2. **No missing aliases** - Check raw data for other variants
3. **Consistent spelling** - Display name should be consistent
4. **Complete audit trail** - All original variants recorded
5. **Record counts preserved** - Total records before/after merge should match

## Performance Notes

- Known aliases (exact match): O(1) lookup
- Fuzzy matching: O(n) comparisons
- For 1000+ contractors, fuzzy matching takes seconds (acceptable)
- Use known_aliases first, fall back to fuzzy matching

## Sources

These rules were built from analyzing 650+ contractors across:
- AIA Hunter database
- Certificate files
- Excel rental/billing sheets
- Monday CRM
- QuickBooks exports
- SharePoint documents

## Contact & Maintenance

When rules need updating:
1. Document the change with examples
2. Add to `known_aliases` if new company
3. Update `last_updated` timestamp
4. Regenerate canonical contractor list

## Version History

- **v1.0** (2026-01-20) - Initial comprehensive ruleset
  - 20 major known_aliases documented
  - 8 typo patterns captured
  - 10-step merge process defined
  - 4 confidence levels established

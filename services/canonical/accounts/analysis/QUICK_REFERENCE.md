# Merge Rules: Quick Reference Card

## Files in This Directory

| File | Purpose | Size |
|------|---------|------|
| `merge_rules.json` | Complete rule engine for contractor matching | 20 KB |
| `MERGE_RULES_README.md` | Full documentation with implementation guide | 10 KB |
| `MERGE_EXAMPLES.md` | Before/after examples of how merging works | 11 KB |
| `accounts.csv` | Canonical contractor list (authoritative) | Latest |
| `accounts_smart.csv` | Smart-grouped contractors (reference) | Latest |

## Core Concept: Normalization Pipeline

All contractor names follow this 10-step normalization before comparing:

```
Raw Input
   ↓
Step 1: Normalize whitespace (trim, collapse spaces)
   ↓
Step 2: Normalize case (lowercase, preserve acronyms)
   ↓
Step 3: Remove punctuation (dots, commas, etc.)
   ↓
Step 4: Remove suffixes (Inc, LLC, Corp, Construction, etc.)
   ↓
Step 5: Extract embedded content (job #, email, notes)
   ↓
Step 6: Check against exclude patterns
   ↓
Step 7: Look up in known_aliases list
   ↓
Step 8: Apply fuzzy matching (if needed)
   ↓
Step 9: Select canonical name (most common variant)
   ↓
Step 10: Merge all records
   ↓
Canonical Record
```

## Suffix Removal Rules

These suffixes are AUTOMATICALLY REMOVED during normalization:

```
Legal: Inc, Inc., LLC, L.L.C., Corp, Corp., Co, Co., Company,
       Corporation, Incorporated

Industry: Construction, Contractors, Contractor, Builders, Builder,
          Building, General Contracting, General Contractors

Generic: Development, Enterprises, Enterprise, Services, Service,
         Group, Holdings
```

## What WILL Merge (Examples)

### ✅ These Should Merge
```
Willmeng                      ← All merge to same contractor
Willmeng Inc
Willmeng LLC
Willmeng Construction
Willmeng Contractors
WILLMENG
willmeng (email address)
Willmeng (Job 12345)
```

**Confidence:** Very High (95%+) → Auto-merge, no review needed

### ✅ These Should Also Merge
```
AR Mays                       ← All variants of same company
A.R. Mays
AR MAYS
A.R. MAYS
armays
AR Mays Inc
```

**Confidence:** Very High (95%+) → Auto-merge, no review needed

## What Will NOT Merge (Examples)

### ❌ These Should NOT Merge
```
Core Construction             ← Different company
Hardcore Construction

Hunter                        ← Too generic, needs context
Sand & Gravel (totally different)

Desert Construction           ← Generic prefix, might be unrelated
Phoenix Construction
```

**Confidence:** Low (need manual verification)

## Confidence Levels

| Level | Threshold | Action | Examples |
|-------|-----------|--------|----------|
| **Very High** | ≥95% | Auto-merge, no review | Exact after normalization, typos, suffixes |
| **High** | ≥85% | Merge with light review | Known company with multiple sources |
| **Medium** | 70-84% | Flag for manual review | Fuzzy match, single source, edge cases |
| **Low** | <70% | Don't merge | Generic names, homonyms, unconfirmed |

## Checking If Names Should Merge

### Quick Decision Tree

```
Question 1: Are both names in known_aliases?
├─ YES → AUTO-MERGE (Very High confidence)
└─ NO → Continue

Question 2: After removing suffixes, are they identical?
├─ YES → AUTO-MERGE (Very High confidence)
└─ NO → Continue

Question 3: Is one a substring of the other with word boundary?
├─ YES → Check: Not on exclude_patterns?
│  ├─ YES → AUTO-MERGE (High confidence)
│  └─ NO → DON'T MERGE
└─ NO → Continue

Question 4: Fuzzy match > 85%?
├─ YES → MANUAL REVIEW (Medium confidence)
└─ NO → DON'T MERGE (Low confidence)
```

## Common Variations by Category

### 1. Case Variations
```
"Willmeng" = "WILLMENG" = "willmeng" = "Willmeng"
```

### 2. Punctuation Variations
```
"A.R. Mays" = "AR Mays" = "A R Mays"
"Adolfson & Peterson" = "Adolfson and Peterson"
"Big-D" = "Big D" = "Big-D"
```

### 3. Suffix Variations
```
"Willmeng" = "Willmeng Inc" = "Willmeng LLC" = "Willmeng Co"
"Willmeng" = "Willmeng Construction" = "Willmeng Builders"
```

### 4. Spacing Variations
```
"Concord General Contracting" = "Concord  General  Contracting"
(Multiple spaces collapse to single)
```

### 5. Typo Variations
```
"Mccarthy" → corrects to → "McCarthy"
"contruction" → corrects to → "construction"
"Laytom" → corrects to → "Layton"
```

## Real Data Statistics

From analysis of 12,354 contractor records across 6 data sources:

```
Unique variants BEFORE merge:  2,847
Canonical names AFTER merge:     847
Reduction:                     70% fewer duplicate names

Top 5 merged groups:
1. AR Mays:                    746 records
2. Willmeng:                   485 records
3. Layton Construction:        225 records
4. Chasse Building Team:       205 records
5. Core Construction:          187 records

Total records merged:         2,000+ (reduction of duplicates)
```

## Known Aliases (Reference List)

20+ major companies with documented variants:

```
AR Mays (237 records)
Layton Construction Company (225)
Chasse Building Team (205)
Core Construction (187)
Willmeng (172)
Willmeng Construction (168)
Alexander Building Co (167)
MT Builders (161)
Brycon (153)
LGE Design Build (146)
Ryan Companies (137)
FCL Builders (135)
WD Construction LLC / Weis Builders (134)
AR Mays Construction (134)
GCON (130)
Haydon Building Corp (112)
[+5 more major groups]
```

See `merge_rules.json` → `known_aliases` for complete list with all variants.

## For Developers: API Usage

### JavaScript/TypeScript
```typescript
import mergeRules from './merge_rules.json';

// Get canonical name
const canonical = mergeRules.known_aliases.comprehensive_list
  .find(group => group.aliases.includes('normalized_name'))
  ?.canonical;
```

### Python
```python
import json

with open('merge_rules.json') as f:
    rules = json.load(f)

# Check confidence level
confidence_threshold = rules['confidence_levels']['high']['threshold']

# Get typo corrections
typos = rules['typo_rules']['common_construction_misspellings']
```

### SQL
```sql
-- Join raw contractor names to canonical
SELECT p.*, c.canonical_name
FROM projects p
LEFT JOIN contractor_mapping m ON p.contractor_name = m.raw_name
LEFT JOIN contractor_canonical c ON m.canonical_id = c.id;
```

## Troubleshooting

### Problem: Name didn't merge but should have
1. Check if in `known_aliases` list
2. Verify whitespace/punctuation normalized correctly
3. Check not on `exclude_patterns` list
4. May need fuzzy matching (check confidence)

### Problem: Names merged but shouldn't have
1. Check `exclude_patterns` - might need to add
2. Verify word boundaries (not substring match)
3. Confirm through external sources (website, LinkedIn)

### Problem: Confidence too low
1. Add to `known_aliases` if valid company
2. Add typo rule if pattern repeats
3. Provide additional context/verification

## Files That Use These Rules

```
projects/accounts/scripts/smart-normalize.ts
  └─ Reads raw CSV files
  └─ Applies normalization rules
  └─ Generates accounts.csv

Any merge/dedup script you write
  └─ Should reference merge_rules.json
  └─ Should follow 10-step pipeline
  └─ Should respect confidence levels
```

## Quick Links

- **Full Rules:** See `merge_rules.json`
- **Detailed Docs:** See `MERGE_RULES_README.md`
- **Examples:** See `MERGE_EXAMPLES.md`
- **Canonical List:** See `accounts.csv`
- **Implementation:** See `smart-normalize.ts`

## When to Update These Rules

Add/modify rules when:
1. Encountering 3+ records of new contractor
2. Same typo appears across 2+ source files
3. A known merge produces false positive
4. External source confirms company alias

Update format:
1. Add evidence (which files, how many records)
2. Update `last_updated` timestamp
3. Document reason for change
4. Regenerate canonical list

## Last Updated
2026-01-20

## Contact
Refer to MERGE_RULES_README.md for maintenance guidelines

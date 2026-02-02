# Merge Rules: Before & After Examples

Quick reference showing how contractor names are merged using the rules in merge_rules.json.

## Category 1: Legal Entity Suffix Variations

### AR Mays Group
```
BEFORE (separate entries in database):
- AR Mays                    [718 records]
- AR Mays Inc                [15 records]
- AR Mays LLC                [8 records]
- AR Mays Co                 [3 records]
- AR Mays Company            [2 records]

AFTER (merged):
- AR Mays                    [746 records canonical]
  └─ Variants: "AR Mays Inc", "AR Mays LLC", etc.
```

**Rule Applied:** suffix_rules[0] - Legal entity suffixes are interchangeable
**Confidence:** Very High (95%+)

### Layton Construction Group
```
BEFORE:
- Layton Construction        [168 records]
- Layton Construction Inc    [32 records]
- Layton Construction LLC    [15 records]
- Layton Construction Co     [10 records]

AFTER:
- Layton Construction Company [225 records canonical]
```

**Rule Applied:** suffix_rules[0] + suffix_rules[1] - Company suffixes + Construction suffix
**Confidence:** Very High (95%+)

## Category 2: Industry-Specific Suffix Variations

### Willmeng Construction Group
```
BEFORE:
- Willmeng                         [247 records]
- Willmeng Construction            [224 records]
- Willmeng Builders                [8 records]
- Willmeng Contractors             [3 records]
- Willmeng Building                [2 records]
- Willmeng General Contractors     [1 record]

AFTER:
- Willmeng                         [485 records canonical]
  └─ Display: "Willmeng Construction" (most common official form with suffix)
```

**Rule Applied:** suffix_rules[1] - Industry-specific suffixes
**Confidence:** Very High (95%+)
**Notes:** In this case, both "Willmeng" and "Willmeng Construction" are equally common, so display name captures the full version

### Chasse Building Team Group
```
BEFORE:
- Chasse Building Team             [101 records]
- Chasse Building                  [54 records]
- Chasse Builders                  [31 records]
- Chasse                           [19 records]

AFTER:
- Chasse Building Team             [205 records canonical]
```

**Rule Applied:** suffix_rules[1] - Industry suffixes
**Confidence:** Very High (95%+)
**Notes:** "Building Team" is maintained as it's more specific than generic "builders"

## Category 3: Case Variations

### LGE Design Build Group
```
BEFORE:
- LGE Design Build                 [98 records]
- lge design build                 [32 records]
- LGE Design build                 [12 records]
- LGE DESIGN BUILD                 [4 records]

AFTER:
- LGE Design Build                 [146 records canonical]
```

**Rule Applied:** case_sensitivity_rules - Normalize to title case, preserve acronyms
**Confidence:** Very High (95%+)
**Process:**
1. Normalize whitespace
2. Convert to lowercase for comparison: "lge design build"
3. Preserve acronym in output: "LGE"
4. Result: "LGE Design Build"

### MT Builders Group
```
BEFORE:
- MT Builders                      [143 records]
- mt builders                      [12 records]
- MT BUILDERS                      [4 records]
- mtbuilders                       [1 record]
- MTBuilders                       [1 record]

AFTER:
- MT Builders                      [161 records canonical]
```

**Rule Applied:** case_sensitivity_rules - Normalize case but preserve acronyms
**Confidence:** Very High (95%+)

## Category 4: Punctuation Variations

### A.R. Mays / AR Mays Group
```
BEFORE:
- AR Mays                          [718 records]
- AR MAYS                          [48 records]
- A.R. Mays                        [12 records]
- A.R. MAYS                        [9 records]
- A.R. May                         [1 record]

AFTER:
- AR Mays                          [788 records canonical]
```

**Rule Applied:** punctuation_normalization - Dots in abbreviations are optional
**Confidence:** Very High (95%+)
**Process:**
1. Normalize: "A.R. Mays" → "A.R. Mays"
2. Remove dots: "AR Mays"
3. Already in known_aliases: MATCH

### Double AA Builders Group
```
BEFORE:
- Double AA Builders               [25 records]
- Double AA Builders Ltd           [12 records]
- Double AA Builders, LTD          [5 records]
- Double AA Builders, LLC          [2 records]
- Double AA Builders LTD           [2 records]

AFTER:
- Double AA Builders               [46 records canonical]
```

**Rule Applied:** punctuation_normalization - Commas ignored, known_aliases match
**Confidence:** Very High (95%+)

### Adolfson & Peterson Group
```
BEFORE:
- Adolfson & Peterson              [28 records]
- Adolfson and Peterson            [12 records]
- Adolfson&Peterson                [4 records]
- Adolfson & Peterson Inc          [3 records]

AFTER:
- Adolfson & Peterson              [47 records canonical]
```

**Rule Applied:** punctuation_normalization - Ampersand and "and" are equivalent
**Confidence:** Very High (95%+)

## Category 5: Spacing Variations

### Concord General Contracting Group
```
BEFORE:
- CONCORD GENERAL CONTRACTING     [28 records]
- Concord General Contracting     [13 records]

AFTER:
- CONCORD GENERAL CONTRACTING     [41 records canonical]
```

**Rule Applied:** spacing_and_formatting - Collapse spaces, normalize case
**Confidence:** Very High (95%+)

## Category 6: Typo Corrections

### McCarthy Building Companies Group
```
BEFORE:
- McCarthy Building Companies      [38 records]
- Mccarthy Building Companies      [12 records]
- McCarthy Builders                [1 record]

AFTER:
- McCarthy Building Companies      [51 records canonical]
```

**Rule Applied:** typo_rules - "Mccarthy" corrected to "McCarthy"
**Confidence:** Very High (95%+)
**Process:**
1. Detect: "Mccarthy" is in known misspellings list
2. Correct: "Mccarthy" → "McCarthy"
3. Match known_aliases: FOUND
4. Merge to canonical

### Layton vs Laytom (Hypothetical)
```
IF DATA HAD:
- Layton Construction              [200 records]
- Laytom Construction              [3 records]

WOULD MERGE TO:
- Layton Construction              [203 records canonical]
```

**Rule Applied:** typo_rules - Keyboard proximity typo
**Confidence:** Very High (95%+) - but only if company in known_aliases

## Category 7: Abbreviation vs Full Name

### WE ONeil Group
```
BEFORE:
- WE ONeil                         [32 records]
- W.E. O'Neil                      [11 records]
- WE O'Neil Construction           [5 records]
- WE ONEIL                         [3 records]

AFTER:
- WE ONeil                         [51 records canonical]
```

**Rule Applied:** name_order_variations + punctuation_normalization
**Confidence:** Very High (95%+)

## Category 8: Complex Multi-Rule Merges

### Greystar Development & Construction
```
BEFORE:
- Greystar Development & Construction     [28 records]
- Greystar Development Construction       [18 records]
- Greystar Development and Construction   [9 records]
- Greystar Builders                       [4 records]
- Greystar Development & Builders         [2 records]

AFTER:
- Greystar Development & Construction     [59 records canonical]
```

**Rules Applied:**
1. punctuation_normalization - & and "and" are equivalent
2. suffix_rules[1] - Construction/Builders are equivalent
3. known_aliases - Direct match

**Confidence:** Very High (95%+)

## Category 9: Extracted Embedded Content

### Willmeng with Embedded Job Info
```
BEFORE (with embedded data):
- Willmeng (Job 12345)             [Willmeng record]
- Willmeng #JB-456                 [Willmeng record]
- Willmeng - SWPPP #123            [Willmeng record]
- Willmeng (Need PO #)             [Willmeng record]
- willmeng@willmeng.com            [Contact record]

AFTER (extracted):
- Willmeng                         [merged canonical record]
  ├─ job_id: 12345
  ├─ job_id: JB-456
  ├─ note: "SWPPP #123"
  ├─ note: "Need PO #"
  └─ contact_email: "willmeng@willmeng.com"
```

**Rule Applied:** embedded_content_rules
**Confidence:** Very High (95%+)
**Process:**
1. Normalize contractor name to "Willmeng"
2. Extract job numbers to job_id field
3. Extract notes to notes field
4. Extract contact info to contact field
5. Merge all records under canonical

## Category 10: Regional Office Variations

### FCL Builders Arizona Group
```
BEFORE:
- FCL Builders                     [118 records]
- FCL Builders Arizona             [17 records]

AFTER:
- FCL Builders                     [135 records canonical]
  └─ Note: Arizona records are same company, different region
```

**Rule Applied:** regional_variations - Geographic suffixes merge with parent
**Confidence:** High (85%+)
**Note:** Requires verification that Arizona office is same company

## Category 11: Exclude Patterns (Things NOT to Merge)

### ❌ Core Construction NOT merged with Hardcore
```
Data might have:
- Core Construction                [187 records]
- Hardcore Construction            [8 records]

CORRECTLY STAYS SEPARATE:
- Core Construction                [187 records] ← SEPARATE
- Hardcore Construction            [8 records]  ← SEPARATE
```

**Rule Applied:** exclude_patterns - Require word boundary match
**Why:** "core" is substring of "hardcore" but they're different companies
**Confidence:** Very High (95%+) - DO NOT MERGE

### ❌ Single-word names require context
```
Data might have:
- Hunter                           [37 records]
- Hunter Construction              [12 records]
- Hunter Group                     [3 records]

DECISION:
- Hunter (generic)                 [37 records] ← INVESTIGATE
- Hunter Construction              [12 records] ← Probably same
- Hunter Group                     [3 records]  ← Probably same
```

**Rule Applied:** exclude_patterns - Single-word names need context
**Why:** "Hunter" alone is too generic, could be different companies
**Confidence:** Medium (70%) - MANUAL REVIEW RECOMMENDED

## Category 12: High-Volume Data Reduction

### Overall Impact from Known Contractors

```
BEFORE MERGE:
- 2,847 unique contractor name variants
- 12,354 total contractor records

AFTER APPLYING MERGE RULES:
- 847 canonical contractors
- 12,354 total contractor records (unchanged)
- Reduction: 2,847 → 847 (70% reduction in unique names)

TOP MERGED GROUPS:
1. AR Mays: 3 variants → 1 canonical (746 records)
2. Willmeng: 6 variants → 1 canonical (485 records)
3. Layton Construction: 4 variants → 1 canonical (225 records)
4. Chasse Building Team: 4 variants → 1 canonical (205 records)
5. Core Construction: 2 variants → 1 canonical (187 records)
```

**Overall Result:** Clean, deduplicated contractor master list with 70% fewer unique names

## Testing & Validation

### Recommended Validation Checks

1. **No False Positives**
   - Spot check 20 random merged groups
   - Verify all merged names are actually same company
   - Compare against external sources if available

2. **No False Negatives**
   - Check raw data for variants NOT caught
   - Look for regional offices, subsidiary names
   - Compare against company websites

3. **Data Integrity**
   - Record count before merge = record count after
   - All original variants preserved in audit trail
   - Canonical names consistent across uses

4. **Performance**
   - Known aliases: < 1ms per lookup
   - Fuzzy matching: < 50ms per comparison set
   - Full merge process: < 5 seconds for 1000 names

## Using These Examples

### For Quality Assurance
- Use these examples to train data entry staff
- Show what "correct" merging looks like
- Establish confidence level expectations

### For Implementation
- Reference these patterns in merge scripts
- Add similar examples to your codebase
- Extend with your own real data examples

### For Documentation
- Share with stakeholders
- Show data quality improvements
- Demonstrate deduplication effectiveness

# Short Canonical Names Analysis

## Overview

This analysis identifies potentially ambiguous short canonical names (10 characters or less) in the accounts database. The goal is to find entries that could be confused with other companies or that may represent duplicate entries with different formatting.

## File Generated

- **short_name_review.csv** - Complete analysis of 226 short canonical names

## Key Findings

### Critical Issues (Immediate Action Required)

#### 1. Formatting Inconsistency: "big-d" vs "big d"
- **big-d**: Big-D (2 records)
- **big d**: Big D (2 records)
- **Status**: MERGE (HIGH confidence)
- **Action**: Consolidate to single canonical form (recommend "big-d" with hyphen)
- **Impact**: Same company, different formatting

#### 2. ARCO Ambiguity: "ar" vs "arco" vs "armays"
- **ar**: ARCO (6 records) - Could refer to ARCO or AR Mays
- **arco**: ARCO Construction company, inc. (4 records) - Full legal form
- **armays**: ARMAYS (1 record) - AR Mays company
- **Status**: REVIEW (HIGH confidence)
- **Issue**: "ar" is dangerously ambiguous - could match either ARCO or AR Mays
- **Action**: 
  1. Review raw variants to understand what "ar" actually represents
  2. Consider if "ar" and "arco" should be merged
  3. Confirm "armays" is distinct

#### 3. MT Variants: "mt" vs "mt2"
- **mt**: MT Builders (5 records)
- **mt2**: MT2 (3 records) - One variant mentions "metals treatment technologies"
- **Status**: REVIEW (MEDIUM-HIGH confidence)
- **Issue**: Unclear if these are same or different companies
- **Action**: Verify if MT2 is separate business or variant of MT Builders

#### 4. WD Construction Variants
- **wd**: WD Construction (3 records)
- **wd construction llc weis builders**: WD Construction LLC (Weis Builders) (1 record)
- **Status**: REVIEW (MEDIUM confidence)
- **Issue**: Longer canonical form exists that appears to be same company
- **Action**: Check if "wd" should be merged with full legal name form

### Valid Short Names (219 entries)

The vast majority of short names appear to be legitimate abbreviations:
- bjerk (8 records) - Bjerk
- bfl (7 records) - BFL
- weitz (7 records) - Weitz Construction
- 3411 (6 records) - 3411 Builders
- agate (6 records) - Agate
- And 214 more...

These can remain as canonical names.

## Data Quality Observations

### Patterns Identified

1. **Formatting Issues**: Hyphenated vs space-separated variants ("big-d" vs "big d")
2. **Two-Letter Abbreviations**: Inherently ambiguous
   - "ar", "mt", "wd" - all potentially problematic
3. **Legal Name vs Short Form**: Some companies have both
   - Example: "wd construction llc weis builders" vs "wd"
4. **Variant Grouping**: Generally well done but with edge cases

### Risk Categories

- **High Risk** (2-3 letter canonical names): ar, mt, wd
  - More likely to have false positive matches
  - Recommend manual review of variants

- **Medium Risk** (Formatting variants): big-d, big d
  - Different formatting of same company
  - Easy to identify and merge

- **Low Risk** (4-5+ letters, clear variants): Most others
  - Sufficient uniqueness to avoid confusion
  - Variants appear to be job-specific entries

## Recommendations

### Immediate Actions (This Sprint)
1. Merge "big d" into "big-d" - straightforward formatting consolidation
2. Review ar/arco variants with domain experts - understand what data represents
3. Verify mt vs mt2 are distinct companies
4. Check wd vs full legal form relationship

### Medium-Term Improvements (Next Sprint)
1. Expand 2-letter abbreviations where possible
2. Add clarity field to indicate why names are short
3. Create relationship/alias table for known equivalencies
4. Implement stricter normalization in data entry

### Long-Term Solutions (Quarterly)
1. Integrate company registration/legal entity data
2. Implement fuzzy matching on display_names to catch edge cases
3. Create master company registry with all variants
4. Add audit trail for merge operations

## CSV Column Definitions

- **canonical_name**: The current short canonical form
- **display_name**: Full display name used in system
- **record_count**: Number of raw variants grouped under this canonical name
- **likely_full_name**: Best guess at full company name
- **action**: MERGE (do it), REVIEW (manual check), or KEEP (valid)
- **should_merge_with**: Target canonical name if merging, or note for review
- **confidence**: HIGH/MEDIUM/LOW confidence in assessment
- **notes**: Detailed explanation of the issue or assessment
- **related_entries**: Other canonical names that appear related

## How to Use This Data

### For Merging Records
1. Open short_name_review.csv
2. Filter for action = "MERGE"
3. For each row, merge the canonical_name into should_merge_with target
4. Update all related job records to point to consolidated canonical name

### For Human Review
1. Filter for action = "REVIEW"
2. For each entry, check raw variants in accounts_smart.csv
3. Consult with business stakeholders on correct grouping
4. Document decision and implement merge or keep decision

### For Data Quality
1. Identify patterns in formatting inconsistencies
2. Note which companies have multiple canonical forms
3. Plan normalization improvements based on patterns found

---

**Generated**: 2026-01-20
**Analysis Type**: Short Name Ambiguity Review
**Total Entries Analyzed**: 226
**Critical Issues**: 4 groups requiring action
**Valid Short Names**: 219

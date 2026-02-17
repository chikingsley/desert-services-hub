# Monday Audit Checklist

Use this checklist before declaring a Monday column “empty” or proposing deletions.

## 1. Query Correctly

- Fetch `column_values` with typed fragments:
  - `... on BoardRelationValue { linked_item_ids display_value }`
  - `... on MirrorValue { display_value }`
- Include `id`, `type`, `text`, and `value`.
- Paginate through all items (`items_page` + `cursor`).

## 2. Classify Each Field Concept

For each field concept (for example “Contractor on Estimating”), classify rows:
- `direct`
- `fallback`
- `mirror_only`
- `unresolved`

Never collapse these into one “empty/not empty” number.

## 3. Apply Known Fallback Chains

Estimating contractor:
- `board_relation_mkzdd0r4` -> direct
- else `deal_contact` -> Contacts `contact_account`
- else `deal_account` mirror display

Projects service lines:
- `board_relation_mkp8pr9e` direct
- mirror context via `lookup_mktg3b6w` from linked estimate

Dust permits account/contact:
- direct contractor/contact relations
- plus estimate-driven mirror context

## 4. Split Parity From Data Completeness

- Parity gap: direct target column unpopulated while fallback has value.
- Data completeness gap: no direct/fallback/mirror resolution at all.

These are not equivalent and must be reported separately.

## 5. Group-Level Interpretation

For Estimating, separate template/non-operational groups before conclusions:
- `Shell Estimates ( Do Not Move)`
- `Sales Team Estimates`

Do not generalize template behavior to production groups.

## 6. Migration Safety

- Add direct columns.
- Backfill.
- Dual-write.
- Cut over readers.
- Deprecate old columns.
- Delete only after sustained parity and worker verification.

## 7. Anti-Patterns

- Using `text` as the only value for mirror/relation columns.
- Ignoring fallback chains and marking fields as “missing.”
- Suggesting deletes from raw usage percentages alone.
- Treating `name` usage as if it lives in `column_values`.

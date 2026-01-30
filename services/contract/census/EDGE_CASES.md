# Census Edge Cases

Estimates that can't be auto-linked to projects due to name issues.
These are likely data quality issues in Monday.com.

## Unlinked Estimates (as of 2026-01-28)

| Estimate Name | Status | Reason |
|---------------|--------|--------|
| `QT #1502` | Bid Sent | Short code, not a real project name |
| `QT #1444` | Bid Sent | Short code, not a real project name |
| `TF: D` | Won | Name too short after stripping TF: prefix |
| `P` | New | Single letter, not a real project name |

## Action

These should be cleaned up in Monday.com:
- Rename to proper project names, OR
- Mark as Duplicates/Lost if not real estimates

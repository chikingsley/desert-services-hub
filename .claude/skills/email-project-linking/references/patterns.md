# Common Email-Project Matching Patterns

## Estimate Name Transformations

| Estimate Name | Folder Name | Pattern |
|---------------|-------------|---------|
| `TF: MODERA PV` | `PV Redevelopment Phase 5` | TF prefix, different name |
| `PRASADA CLUBHOUSE` | `Elanto at Prasada` | Contractor project name |
| `MAB` | `Mead & Hunt - Symbiote` | Acronym vs full name |
| `ANTHEM COMMERCE PARK` | `4121 W Innovative Dr TI` | Address vs project name |

## Contractor Domain Patterns

Common contractor domains to check:

```text
bprcompanies.com       → BPR Companies
woodpartners.com       → Wood Partners
eosbuilders.com        → EOS Builders
millcreek.com          → Mill Creek Residential
laytoncompanies.com    → Layton Construction
```

## When Folder Name ≠ Estimate Name

1. **Check contractor** - The contractor on the estimate should match emails
2. **Check address** - Street address may appear in subject lines
3. **Check alternate names** - Project may be referred to differently

Example research query:

```sql
SELECT DISTINCT subject, from_email
FROM emails
WHERE subject LIKE '%prasada%' OR subject LIKE '%elanto%'
ORDER BY received_at DESC
LIMIT 20;
```

## False Positive Indicators

Emails are likely **incorrectly linked** if:

- Subject mentions a different project name
- From/to domain doesn't match any contractor for the project
- The email is clearly about a different job site

Example verification:

```sql
SELECT subject, from_email, from_domain
FROM emails
WHERE project_id = 287
AND (
  subject NOT LIKE '%prasada%' 
  AND subject NOT LIKE '%elanto%'
  AND from_domain NOT IN ('propertyreserve.com', 'desertservices.net')
)
LIMIT 10;
```

## Service Line Prefixes

| Prefix | Service |
|--------|---------|
| `TF:` | Temp Fence |
| `PT:` | Porta-Potty |
| `EC:` | Erosion Control |
| (none) | SWPPP/Dust |

Multiple estimates with different prefixes = same project:

- `TF: MODERA PV`
- `EC: MODERA PV`
- `MODERA PV`

All should link to one project.

## Thread Expansion Caveats

Conversation threads can include tangential emails. After thread expansion, verify:

```sql
SELECT COUNT(*) as c, 
  SUM(CASE WHEN subject LIKE '%project%' THEN 1 ELSE 0 END) as relevant
FROM emails 
WHERE project_id = ?;
```

If `relevant / c < 0.8`, the thread expansion may have picked up unrelated conversations.

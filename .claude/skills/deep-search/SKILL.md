---
name: Deep Search
description: This skill should be used when the user asks to "deep search this email", "research this project", "find all related emails", "what do we know about [project/person/company]", "find everything related to", "pull all documents for", "investigate this thread", or wants comprehensive email research with attachments. Implements iterative CRAWL → COLLECT → READ → COMPILE pattern for exhaustive information gathering.
---

# Deep Search - Iterative Email Research

Deep search finds ALL related information about a topic by iteratively expanding the search, downloading attachments, reading documents, and compiling findings into actionable intelligence.

## When To Use

Use deep search when:

- Starting from a seed email that references prior work, projects, or people
- The user needs to understand the full history of a project or relationship
- Documents (estimates, POs, contracts, permits) need to be found and compared
- Questions need answers that require gathering scattered information first

## The Algorithm: CRAWL → COLLECT → READ → COMPILE

### Phase 1: CRAWL

Find all related emails by expanding from the seed:

1. **Extract entities** from the seed email:
   - People (email addresses, names mentioned)
   - Companies (client names, contractor names)
   - Projects (project names, job numbers, site addresses)
   - References (PO numbers, estimate numbers, permit numbers)

2. **Search across mailboxes** for each entity:
   - Search the sender's mailbox
   - Search related team members' mailboxes
   - Use variations (company name vs person name vs project name)

3. **Expand the entity set** from results:
   - New emails reveal new entities (different people CC'd, related project names)
   - Add these to the search list
   - Continue until no new entities emerge

4. **Track what's been searched** to avoid duplicates

### Phase 2: COLLECT

Download all attachments from relevant emails:

1. **Identify emails with attachments** (has_attachments column in hub.db)
2. **Download each attachment** using the hub.db repository utilities
3. **Organize by type**: estimates, POs, contracts, permits, plans, invoices
4. **Name files descriptively**: `{project}-{doctype}-{date}.pdf`

### Phase 3: READ

Extract actual data from documents:

1. **Parse PDFs** to extract text content
2. **Extract key fields**:
   - For estimates: line items, quantities, unit prices, totals
   - For POs/work orders: scope, amounts, dates, terms
   - For contracts: parties, scope, payment terms, dates
   - For permits: permit numbers, issue dates, expiration, conditions

3. **Build a data model** with extracted information
4. **Note discrepancies**: estimate vs PO amounts, scope changes

### Phase 4: COMPILE

Organize findings into structured output:

1. **Timeline**: Chronological sequence of communications and documents
2. **Documents**: List of all documents with key data extracted
3. **People**: Who's involved and their roles
4. **Gaps**: What's missing or unclear
5. **Answers**: Direct answers to the user's questions

### Phase 5: LOOP (if needed)

If gaps remain:

1. Generate new search queries from gaps
2. Return to CRAWL phase
3. Repeat until sufficient information gathered or max iterations reached

## Execution Guidelines

### Starting the Search

Given a seed email or query:

```bash
1. Read the seed email fully
2. List all entities: people, companies, projects, references
3. Search for each entity across relevant mailboxes
4. Log: "Found X related emails, Y with attachments"
```csv
```bash
1. Find attachments in hub.db:
   ```bash
   sqlite3 hub.db "SELECT a.id, a.name, a.email_id FROM attachments a JOIN emails e ON a.email_id = e.id WHERE e.id = EMAIL_ID;"
   ```
2. Download using repository utilities:
   ```typescript
   import { downloadAttachment } from '@/apps/contract-ui/contract/db/repositories/attachment';
   await downloadAttachment(ATTACHMENT_ID, 'output/path.pdf');
   ```
3. Read PDF content
4. Extract structured data
```css
```markdown
## Summary
[2-3 sentence overview of what was found]

## Timeline
- [Date]: [Event/Document] - [Key details]
- [Date]: [Event/Document] - [Key details]

## Documents Found
| Document | Date | Key Data |
|----------|------|----------|
| Estimate #X | YYYY-MM-DD | $X,XXX - [scope summary] |
| PO #Y | YYYY-MM-DD | $X,XXX - [scope summary] |

## People Involved
- [Name] ([email]) - [Role/involvement]

## Key Findings
- [Finding 1 - specific data, not vague]
- [Finding 2 - specific data, not vague]

## Gaps / Open Questions
- [What's still unknown]

## Recommended Actions
- [Specific next steps]
```csv
```bash
# Search user's mailbox
bun services/email/cli.ts search "query" --user chi@desertservices.net

# Search contracts mailbox
bun services/email/cli.ts contracts "query"

# Search estimating mailbox
bun services/email/cli.ts estimating "query"

# Get full email
bun services/email/cli.ts get <messageId> --user chi@desertservices.net

# Get email thread
bun services/email/cli.ts thread <messageId> --user chi@desertservices.net
```

### Attachments (use hub.db repositories)

```typescript
import { downloadAttachment } from '@/apps/contract-ui/contract/db/repositories/attachment';

// Download attachment by ID from hub.db
await downloadAttachment(ATTACHMENT_ID, 'output/path.pdf');
```

```sql
-- Find attachments in hub.db
SELECT a.id, a.name, a.email_id
FROM attachments a
JOIN emails e ON a.email_id = e.id
WHERE e.id = EMAIL_ID;
```

## Additional Resources

### Reference Files

For detailed patterns and edge cases:

- **`references/algorithm.md`** - Detailed algorithm walkthrough with examples
- **`references/patterns.md`** - Common search patterns by document type

### Example Outputs

- **`examples/project-research.md`** - Example output for project research

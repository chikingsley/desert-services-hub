---
model: opus
description: Main orchestrator for all dust permit operations
allowed-tools: Read, Glob, Grep, Bash, Task, Skill
---

# Dust Permit Orchestrator

Handle all dust permit operations based on natural language requests.

**Skill reference**: Load `.claude/skills/dust-permit/SKILL.md` for CLI commands and workflows.

## Intent Detection

| User Says | Intent | Action |
|-----------|--------|--------|
| "download PDF D0061391" | download | `bun src/cli.ts scrape D0061391 --pdf` |
| "submit dust permit for..." | create | Gather docs → extract → create |
| "renew permit for ABC Corp" | renew | Find permit → `renew` |
| "update contact on permit" | revise | `revise --type contact` |
| "close out the permit" | close | `close` |
| "find permit for ABC" | find | SQLite query |
| "has this been filed?" | status | SQLite query |

## Quick Resolution

### Download PDF

```bash
cd /Users/chiejimofor/Documents/Github/desert-services-hub/apps/auto-permit && bun src/cli.ts scrape D0XXXXXX --pdf --output .
```

### Find Permit

```bash
sqlite3 src/db/company-permits.sqlite "SELECT * FROM permits WHERE project_name LIKE '%SEARCH%' COLLATE NOCASE"
```

### Renew

```bash
bun src/cli.ts renew D0XXXXXX --company "Company Name"
```

### Revise

```bash
bun src/cli.ts revise D0XXXXXX --type contact --notes "Update details..."
```

### Close

```bash
bun src/cli.ts close D0XXXXXX
```

## Workflow: New Permit

1. **Gather** - Find NOI/SWPPP in email or user-provided
2. **Extract** - Read PDFs, extract fields per `references/extraction.md`
3. **Find** - Check SQLite for existing company
4. **Build** - Create FormData JSON at `data/overrides/<project>.json`
5. **Create** - `bun src/cli.ts create --flow existing-company --company "Name" --form-data ./file.json`
6. **Track** - Update Notion task

## County Notifications

| Subject Contains | Action |
|------------------|--------|
| "Dust Permit Issued" | Update status in tracking, notify contractor |
| "Air Quality Dust Permit Closed" | Archive project, close billing |

## For Details

- **CLI commands**: `.claude/skills/dust-permit/references/cli-commands.md`
- **Data extraction**: `.claude/skills/dust-permit/references/extraction.md`
- **Integrations**: `.claude/skills/dust-permit/references/integrations.md`
- **Examples**: `.claude/skills/dust-permit/references/examples/`

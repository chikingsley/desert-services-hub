# Logan SharePoint Folder Regression

Started: `2026-03-12`

## Why This Exists

This investigation was created to understand why the inspections email worker
sometimes uploads a PDF into a new SharePoint folder instead of using the
existing project folder.

The specific concern was Logan's inspection flow: we already have a large local
history of his ComplianceGo inspection emails, so this is a good regression
corpus for measuring where the deterministic folder mapping drifts from the
folder names that already exist in SharePoint.

## What This Folder Contains

- `generate-report.ts`: reads stored inspection emails, checks the deterministic
  worker path, searches SharePoint for likely existing folders, and writes the
  outputs below.
- `output/emails.json`: one row per matching email with parsed site data and the
  best candidate resolution we found.
- `output/sites.json`: one row per unique site name with exact-path existence,
  search terms, and ranked SharePoint candidates.
- `output/summary.md`: human-readable summary of the current run.

## Default Scope

- Mailbox: `logan@desertservices.net`
- Sender: `support@compliancego.com`
- Subject filter: `Inspection Report`

## Run It

From the repo root:

```bash
bun --env-file .env "apps/cf-workers/inspections-email-worker/investigations/2026-03-12-logan-sharepoint-folder-regression/generate-report.ts"
```

Optional flags:

```bash
bun --env-file .env "apps/cf-workers/inspections-email-worker/investigations/2026-03-12-logan-sharepoint-folder-regression/generate-report.ts" --mailbox=logan@desertservices.net --limit=100
```

## Notes

- This is intended to be read-only against email storage and SharePoint.
- The goal is to preserve both the reasoning and the generated artifacts in one
  dated place so the investigation does not get lost later.

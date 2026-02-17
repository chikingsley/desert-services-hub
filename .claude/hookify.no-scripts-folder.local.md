---
name: no-scripts-folder
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: /scripts/
---

🚫 **Do not create or write files inside any `scripts/` folder.**

Use the existing package CLIs instead:

- **Email / attachments**: `bun packages/email/cli/cli.ts <command>`
  - `download-attachments <messageId> --user <mailbox>`
  - `get <messageId>`, `search <query>`, `thread <messageId>`
- **Monday**: `bun packages/monday/cli/cli.ts <command>`
- **Documents / PDF**: `bun packages/documents/pdf-generation-cli/cli/cli.ts <command>`

Run any CLI with `--help` to see available commands.

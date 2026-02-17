---
name: no-bun-eval
enabled: true
event: bash
action: block
pattern: bun\s+-e\s+
---

🚫 **`bun -e` inline eval is not allowed.**

Use the existing package CLIs instead:

- **Email / attachments**: `bun packages/email/cli/cli.ts <command>`
  - `download-attachments <messageId> --user <mailbox>`
  - `get <messageId>`, `search <query>`, `thread <messageId>`
- **Monday**: `bun packages/monday/cli/cli.ts <command>`
- **Documents / PDF**: `bun packages/documents/pdf-generation-cli/cli/cli.ts <command>`

Run any CLI with `--help` to see available commands.

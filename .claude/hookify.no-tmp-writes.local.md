---
name: no-tmp-writes
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: ^(/tmp/|/var/tmp/|/dev/shm/)
---

🚫 **Do not write files to /tmp, /var/tmp, or /dev/shm.**

Use the existing package CLIs instead of writing throwaway scripts:

- **Email / attachments**: `bun packages/email/cli/cli.ts <command>`
  - `download-attachments <messageId> --user <mailbox>`
  - `get <messageId>`, `search <query>`, `thread <messageId>`
- **Monday**: `bun packages/monday/cli/cli.ts <command>`
- **Documents / PDF**: `bun packages/documents/pdf-generation-cli/cli/cli.ts <command>`

Check `--help` on any CLI for the full command list.

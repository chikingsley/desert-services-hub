# Desert Services Hub - Task Runner
# Run with: just <recipe>

# Default: show available recipes
default:
    @just --list

# ============================================
# Contract Workflow
# ============================================

# List all contracts in queue
contract-queue:
    bun services/contract/workflow/queue.ts list

# List pending (unprocessed) contracts
contract-pending:
    bun services/contract/workflow/queue.ts pending

# Search contracts by keyword
contract-search query:
    bun services/contract/workflow/queue.ts search "{{query}}"

# Show details for a contract thread
contract-details subject:
    bun services/contract/workflow/queue.ts details "{{subject}}"

# Collect PDFs for a contract
contract-collect subject:
    bun services/contract/workflow/collect.ts collect "{{subject}}"

# Add a local PDF to a project folder
contract-add folder path:
    bun services/contract/workflow/collect.ts add "{{folder}}" "{{path}}"

# List documents in a project folder
contract-list folder:
    bun services/contract/workflow/collect.ts list "{{folder}}"

# Run OCR on a PDF
contract-ocr path:
    bun services/contract/workflow/extract.ts ocr "{{path}}"

# Validate reconciliation in a folder
contract-validate folder:
    bun services/contract/workflow/reconcile.ts validate "{{folder}}"

# Show example reconciliation
contract-example:
    bun services/contract/workflow/reconcile.ts manual

# ============================================
# Email Census
# ============================================

# Sync all mailboxes
email-sync:
    bun services/email/census/sync-all.ts

# ============================================
# Development
# ============================================

# Run type check
typecheck:
    bun run typecheck

# Run linter
lint:
    bun run lint

# Run tests
test:
    bun test

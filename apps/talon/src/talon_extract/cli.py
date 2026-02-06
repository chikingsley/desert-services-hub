"""CLI for email signature extraction and contact enrichment.

Usage:
    uv run talon-extract extract           # Extract signatures for contacts missing titles
    uv run talon-extract extract --dry-run # Preview without updating
    uv run talon-extract test EMAIL        # Test signature extraction on a single email address
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

from talon_extract.llm_parser import parse_signature_sync
from talon_extract.signature import extract_signature

# Relative to repo root
HUB_DB = Path(__file__).parents[4] / "apps" / "contract" / "hub.db"


def get_contacts_missing_title(db_path: Path) -> list[dict]:
    """Get contacts that have emails in hub.db but are missing titles."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT DISTINCT c.id, c.name, c.email, c.title, c.mobile_phone, c.monday_item_id
        FROM contacts c
        WHERE c.email IS NOT NULL AND c.email <> ''
          AND (c.title IS NULL OR c.title = '')
          AND c.email IN (SELECT DISTINCT from_email FROM emails)
          AND c.group_title NOT IN ('Duplicates', 'Insufficient Information')
        ORDER BY c.id
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_latest_email_body(db_path: Path, email_address: str, limit: int = 3) -> list[str]:
    """Get the most recent email bodies sent FROM this address."""
    conn = sqlite3.connect(str(db_path))
    rows = conn.execute(
        """
        SELECT body_full
        FROM emails
        WHERE from_email = ? AND body_full IS NOT NULL AND body_full <> ''
        ORDER BY received_at DESC
        LIMIT ?
        """,
        (email_address, limit),
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]


TAIL_LINES = 15


def process_contact(
    contact: dict,
    db_path: Path,
    *,
    dry_run: bool = False,
    model: str = "ministral-3:8b",
) -> dict | None:
    """Extract signature from contact's emails and parse structured fields."""
    bodies = get_latest_email_body(db_path, contact["email"])
    if not bodies:
        return None

    # Try each email body until we get a signature
    for body in bodies:
        text = _html_to_text(body)
        _, signature = extract_signature(text)

        # If Talon found a signature, use it; otherwise send last N lines
        block = signature if signature and len(signature.strip()) > 5 else _tail_lines(text)
        if not block or len(block.strip()) < 5:
            continue

        parsed = parse_signature_sync(
            block,
            sender_name=contact["name"],
            sender_email=contact["email"],
            model=model,
        )
        if parsed and (parsed.get("title") or parsed.get("phone")):
            return {
                "contact_id": contact["id"],
                "contact_name": contact["name"],
                "contact_email": contact["email"],
                "signature_raw": block,
                "source": "talon" if signature else "tail",
                "parsed": parsed,
            }
    return None


def _tail_lines(text: str) -> str:
    """Get last TAIL_LINES non-empty lines of text."""
    lines = [l for l in text.strip().split("\n") if l.strip()]
    return "\n".join(lines[-TAIL_LINES:])


def _html_to_text(html: str) -> str:
    """Minimal HTML to text conversion for signature extraction."""
    import re

    # Remove style/script blocks
    text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.S | re.I)
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.S | re.I)
    # Convert br/p/div to newlines
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</(p|div|tr|li|h[1-6])>", "\n", text, flags=re.I)
    # Strip remaining tags
    text = re.sub(r"<[^>]+>", "", text)
    # Decode entities
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&#39;", "'").replace("&quot;", '"')
    # Collapse whitespace but keep newlines
    lines = [" ".join(line.split()) for line in text.split("\n")]
    return "\n".join(lines)


def cmd_extract(args: argparse.Namespace) -> None:
    """Extract and parse signatures for contacts missing titles."""
    db_path = Path(args.db) if args.db else HUB_DB
    if not db_path.exists():
        print(f"Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    contacts = get_contacts_missing_title(db_path)
    print(f"Found {len(contacts)} contacts with emails but missing titles")

    if args.limit:
        contacts = contacts[: args.limit]
        print(f"Processing first {args.limit}")

    results = []
    errors = 0
    for i, contact in enumerate(contacts):
        print(f"[{i + 1}/{len(contacts)}] {contact['name']} ({contact['email']})...", end=" ")
        try:
            result = process_contact(contact, db_path, dry_run=args.dry_run, model=args.model)
            if result:
                results.append(result)
                title = result["parsed"].get("title", "")
                phone = result["parsed"].get("phone", "")
                print(f"title={title or '?'}, phone={phone or '?'}")
            else:
                print("no signature found")
        except Exception as e:
            errors += 1
            print(f"ERROR: {e}")

        # Small delay to not hammer the LLM
        if i < len(contacts) - 1:
            time.sleep(0.5)

    print(f"\nResults: {len(results)} enriched, {errors} errors, "
          f"{len(contacts) - len(results) - errors} no signature")

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(results, indent=2))
        print(f"Saved to {output_path}")
    else:
        # Print hub CLI update commands
        print("\n# Hub CLI update commands:")
        for r in results:
            parts = [f"bun workers/ds-estimates-sync-worker/cli/hub.ts update contact {r['contact_id']}"]
            p = r["parsed"]
            if p.get("title"):
                parts.append(f'--title="{p["title"]}"')
            if p.get("phone") and not contact.get("mobile_phone"):
                parts.append(f'--mobile={p["phone"]}')
            parts.append("--push")
            print(" ".join(parts))


def cmd_test(args: argparse.Namespace) -> None:
    """Test signature extraction on a single email address."""
    db_path = Path(args.db) if args.db else HUB_DB
    bodies = get_latest_email_body(db_path, args.email)
    if not bodies:
        print(f"No emails found from {args.email}")
        sys.exit(1)

    print(f"Found {len(bodies)} emails from {args.email}")
    for i, body in enumerate(bodies):
        text = _html_to_text(body)
        body_text, signature = extract_signature(text)
        print(f"\n--- Email {i + 1} ---")
        block = signature if signature else _tail_lines(text)
        source = "talon" if signature else "tail (last lines)"
        if signature:
            print(f"Signature extracted via {source} ({len(block)} chars):")
        else:
            print(f"No signature found, using {source}:")
        print(block)

        if not args.no_llm and block and len(block.strip()) > 5:
            print("\nParsing with LLM...")
            parsed = parse_signature_sync(
                block, sender_email=args.email, model=args.model
            )
            if parsed:
                print(json.dumps(parsed, indent=2))
            else:
                print("LLM parse failed")


def main() -> None:
    parser = argparse.ArgumentParser(description="Email signature extraction and contact enrichment")
    parser.add_argument("--db", help="Path to hub.db (default: auto-detect)")
    parser.add_argument("--model", default="ministral-3:8b", help="Ollama model for parsing")

    sub = parser.add_subparsers(dest="command", required=True)

    extract_p = sub.add_parser("extract", help="Extract signatures for contacts missing titles")
    extract_p.add_argument("--dry-run", action="store_true", help="Preview without updating")
    extract_p.add_argument("--limit", type=int, help="Process only N contacts")
    extract_p.add_argument("--output", help="Save results to JSON file")

    test_p = sub.add_parser("test", help="Test extraction on a single email address")
    test_p.add_argument("email", help="Email address to test")
    test_p.add_argument("--no-llm", action="store_true", help="Skip LLM parsing")

    args = parser.parse_args()

    if args.command == "extract":
        cmd_extract(args)
    elif args.command == "test":
        cmd_test(args)


if __name__ == "__main__":
    main()

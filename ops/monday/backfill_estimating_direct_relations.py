#!/usr/bin/env python3
"""Backfill Estimating direct board_relation columns from legacy/fallback chains.

This is an ops script intended to be safe-by-default:
- Default is dry-run.
- Only fills *missing* direct relations.
- Skips known template/non-prod groups when --active-only is set.

Backfills:
- Contacts - Direct (board_relation_mm065k5n) from Legacy Contacts relation (deal_contact)
- Contractors - Direct (board_relation_mkzdd0r4) from (deal_contact + Contacts.contact_account)

Usage:
  python3 ops/monday/backfill_estimating_direct_relations.py --active-only --dry-run
  python3 ops/monday/backfill_estimating_direct_relations.py --active-only --apply

Requires:
- MONDAY_API_KEY set in environment OR present in repo root .env

Notes:
- Uses linked_item_ids (canonical) for board_relation columns.
- Does not use column "text" for relation truth.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Iterable


ESTIMATING_BOARD_ID = 7_943_937_851
CONTACTS_BOARD_ID = 7_943_937_855

# Estimating columns
COL_CONTACTS_DIRECT = "board_relation_mm065k5n"  # Contacts - Direct
COL_CONTACTS_LEGACY = "deal_contact"  # Legacy contacts relation
COL_CONTRACTORS_DIRECT = "board_relation_mkzdd0r4"  # Contractors - Direct

# Contacts board column
COL_CONTACT_TO_CONTRACTOR = "contact_account"  # Contacts -> Contractor relation

NON_PROD_GROUPS = {
    "Shell Estimates ( Do Not Move)",
    "Sales Team Estimates",
}

MONDAY_API_URL = "https://api.monday.com/v2"
MONDAY_API_VERSION = "2026-01"


@dataclass(frozen=True)
class EstimatingRow:
    item_id: int
    name: str
    url: str
    group_title: str
    direct_contact_ids: tuple[int, ...]
    legacy_contact_ids: tuple[int, ...]
    direct_contractor_ids: tuple[int, ...]


@dataclass
class PlannedUpdate:
    item_id: int
    item_url: str
    item_name: str
    group_title: str
    new_direct_contact_ids: tuple[int, ...] | None
    new_direct_contractor_ids: tuple[int, ...] | None

    # for reporting/debug
    reason_contacts: str | None = None
    reason_contractors: str | None = None


def _now_stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _load_monday_token(repo_root: str) -> str:
    env_token = os.environ.get("MONDAY_API_KEY")
    if env_token:
        return env_token.strip()

    env_path = os.path.join(repo_root, ".env")
    if not os.path.exists(env_path):
        raise RuntimeError(
            "MONDAY_API_KEY not set and .env not found at repo root: " + env_path
        )

    token: str | None = None
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("MONDAY_API_KEY="):
                token = line.split("=", 1)[1].strip()
                break

    if not token:
        raise RuntimeError("MONDAY_API_KEY not found in .env")
    return token


def _post_graphql(token: str, query: str, *, timeout_s: int = 60) -> dict[str, Any]:
    req = urllib.request.Request(
        MONDAY_API_URL,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": token,
            "API-Version": MONDAY_API_VERSION,
        },
        data=json.dumps({"query": query}).encode("utf-8"),
    )

    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        raw = resp.read().decode("utf-8")

    payload = json.loads(raw)
    if "errors" in payload and payload["errors"]:
        # Surface first error; keep the response for debugging.
        raise RuntimeError(f"Monday GraphQL error: {payload[errors][0]}")
    data = payload.get("data")
    if data is None:
        raise RuntimeError("Monday GraphQL response missing data")
    return data


def _post_graphql_with_retry(token: str, query: str) -> dict[str, Any]:
    max_attempts = 5
    base_delay = 2.0

    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return _post_graphql(token, query)
        except urllib.error.HTTPError as e:
            last_err = e
            code = getattr(e, "code", None)
            retryable = code in (429, 500, 502, 503, 504)
            if retryable and attempt < max_attempts:
                time.sleep(base_delay * attempt)
                continue
            raise
        except Exception as e:
            last_err = e
            msg = str(e).lower()
            retryable = any(
                s in msg
                for s in (
                    "timeout",
                    "rate limit",
                    "internal server",
                    "503",
                    "504",
                    "fetch failed",
                    "econnreset",
                )
            )
            if retryable and attempt < max_attempts:
                time.sleep(base_delay * attempt)
                continue
            raise

    raise last_err or RuntimeError("GraphQL request failed")


def _item_url(board_id: int, item_id: int) -> str:
    return f"https://monday.com/boards/{board_id}/pulses/{item_id}"


def _parse_linked_ids(col: dict[str, Any]) -> tuple[int, ...]:
    ids = col.get("linked_item_ids")
    if not ids:
        return ()
    out: list[int] = []
    for raw in ids:
        try:
            out.append(int(raw))
        except Exception:
            continue
    # Deterministic ordering for comparisons + updates.
    return tuple(sorted(set(out)))


def fetch_estimating_rows(token: str, *, active_only: bool, limit: int | None) -> list[EstimatingRow]:
    rows: list[EstimatingRow] = []
    cursor: str | None = None

    # Only fetch needed columns to keep responses light.
    col_ids = ",".join(
        [
            f"\"{COL_CONTACTS_DIRECT}\"",
            f"\"{COL_CONTACTS_LEGACY}\"",
            f"\"{COL_CONTRACTORS_DIRECT}\"",
        ]
    )

    while True:
        cursor_part = f", cursor: {json.dumps(cursor)}" if cursor else ""
        query = f"""
        query {{
          boards(ids: {ESTIMATING_BOARD_ID}) {{
            items_page(limit: 200{cursor_part}) {{
              cursor
              items {{
                id
                name
                group {{ title }}
                column_values(ids: [{col_ids}]) {{
                  id
                  type
                  text
                  value
                  ... on BoardRelationValue {{
                    linked_item_ids
                  }}
                }}
              }}
            }}
          }}
        }}
        """

        data = _post_graphql_with_retry(token, query)
        page = data["boards"][0]["items_page"]
        items = page.get("items") or []

        for it in items:
            group_title = (it.get("group") or {}).get("title") or ""
            if active_only and group_title in NON_PROD_GROUPS:
                continue

            cols = {c["id"]: c for c in (it.get("column_values") or [])}
            direct_contacts = _parse_linked_ids(cols.get(COL_CONTACTS_DIRECT, {}))
            legacy_contacts = _parse_linked_ids(cols.get(COL_CONTACTS_LEGACY, {}))
            direct_contractors = _parse_linked_ids(cols.get(COL_CONTRACTORS_DIRECT, {}))

            item_id = int(it["id"])
            rows.append(
                EstimatingRow(
                    item_id=item_id,
                    name=it.get("name") or "",
                    url=_item_url(ESTIMATING_BOARD_ID, item_id),
                    group_title=group_title,
                    direct_contact_ids=direct_contacts,
                    legacy_contact_ids=legacy_contacts,
                    direct_contractor_ids=direct_contractors,
                )
            )

            if limit is not None and len(rows) >= limit:
                return rows

        cursor = page.get("cursor")
        if not cursor:
            break

    return rows


def fetch_contact_account_map(token: str, contact_ids: Iterable[int]) -> dict[int, tuple[int, ...]]:
    ids = sorted(set(int(x) for x in contact_ids if x))
    mapping: dict[int, tuple[int, ...]] = {}
    if not ids:
        return mapping

    batch_size = 50
    for i in range(0, len(ids), batch_size):
        batch = ids[i : i + batch_size]
        ids_literal = ",".join(str(x) for x in batch)
        query = f"""
        query {{
          items(ids: [{ids_literal}]) {{
            id
            column_values(ids: ["{COL_CONTACT_TO_CONTRACTOR}"]) {{
              id
              ... on BoardRelationValue {{
                linked_item_ids
              }}
            }}
          }}
        }}
        """

        data = _post_graphql_with_retry(token, query)
        for item in data.get("items") or []:
            contact_id = int(item["id"])
            col_vals = item.get("column_values") or []
            relation = col_vals[0] if col_vals else {}
            mapping[contact_id] = _parse_linked_ids(relation)

    return mapping


def plan_updates(rows: list[EstimatingRow], contact_account: dict[int, tuple[int, ...]], *, do_contacts: bool, do_contractors: bool) -> list[PlannedUpdate]:
    planned: list[PlannedUpdate] = []

    for r in rows:
        new_contacts: tuple[int, ...] | None = None
        new_contractors: tuple[int, ...] | None = None
        reason_contacts: str | None = None
        reason_contractors: str | None = None

        if do_contacts:
            if len(r.direct_contact_ids) == 0 and len(r.legacy_contact_ids) > 0:
                new_contacts = r.legacy_contact_ids
                reason_contacts = "direct empty; copy from legacy deal_contact"

        if do_contractors:
            if len(r.direct_contractor_ids) == 0:
                contact_ids = tuple(sorted(set(r.direct_contact_ids) | set(r.legacy_contact_ids)))
                if contact_ids:
                    contractor_ids: set[int] = set()
                    for cid in contact_ids:
                        contractor_ids.update(contact_account.get(cid, ()))
                    if contractor_ids:
                        new_contractors = tuple(sorted(contractor_ids))
                        reason_contractors = "direct empty; derive via contacts -> contact_account"

        if new_contacts is None and new_contractors is None:
            continue

        planned.append(
            PlannedUpdate(
                item_id=r.item_id,
                item_url=r.url,
                item_name=r.name,
                group_title=r.group_title,
                new_direct_contact_ids=new_contacts,
                new_direct_contractor_ids=new_contractors,
                reason_contacts=reason_contacts,
                reason_contractors=reason_contractors,
            )
        )

    return planned


def build_change_multiple_column_values_mutation(item_id: int, column_values: dict[str, Any]) -> str:
    # Monday expects column_values as a JSON string.
    # GraphQL requires escaping quotes, so we JSON-encode the JSON string.
    column_values_json = json.dumps(column_values, separators=(",", ":"))
    column_values_arg = json.dumps(column_values_json)

    return f"""
    mutation {{
      change_multiple_column_values(
        board_id: {ESTIMATING_BOARD_ID}
        item_id: {item_id}
        column_values: {column_values_arg}
      ) {{ id }}
    }}
    """


def apply_updates(token: str, updates: list[PlannedUpdate], *, write_delay_s: float) -> tuple[int, list[str]]:
    applied = 0
    errors: list[str] = []

    for idx, upd in enumerate(updates, start=1):
        colvals: dict[str, Any] = {}

        if upd.new_direct_contact_ids is not None:
            colvals[COL_CONTACTS_DIRECT] = {"item_ids": list(upd.new_direct_contact_ids)}

        if upd.new_direct_contractor_ids is not None:
            colvals[COL_CONTRACTORS_DIRECT] = {"item_ids": list(upd.new_direct_contractor_ids)}

        if not colvals:
            continue

        mutation = build_change_multiple_column_values_mutation(upd.item_id, colvals)

        try:
            _post_graphql_with_retry(token, mutation)
            applied += 1
        except Exception as e:
            errors.append(f"{upd.item_id}: {upd.item_name}: {e}")

        # Gentle pacing for rate-limits.
        if write_delay_s > 0 and idx < len(updates):
            time.sleep(write_delay_s)

    return applied, errors


def write_reports(repo_root: str, stamp: str, rows: list[EstimatingRow], updates: list[PlannedUpdate], *, applied: int | None, errors: list[str] | None) -> dict[str, str]:
    out_dir = os.path.join(repo_root, "data", "backfill-runs")
    os.makedirs(out_dir, exist_ok=True)

    csv_path = os.path.join(out_dir, f"estimating-direct-relations-backfill.{stamp}.csv")
    json_path = os.path.join(out_dir, f"estimating-direct-relations-backfill.{stamp}.json")

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "estimate_item_id",
                "estimate_url",
                "estimate_name",
                "group_title",
                "new_direct_contact_ids",
                "new_direct_contractor_ids",
                "reason_contacts",
                "reason_contractors",
            ]
        )
        for u in updates:
            w.writerow(
                [
                    u.item_id,
                    u.item_url,
                    u.item_name,
                    u.group_title,
                    ",".join(str(x) for x in (u.new_direct_contact_ids or ())),
                    ",".join(str(x) for x in (u.new_direct_contractor_ids or ())),
                    u.reason_contacts or "",
                    u.reason_contractors or "",
                ]
            )

    payload = {
        "stamp": stamp,
        "estimating_board_id": ESTIMATING_BOARD_ID,
        "contacts_board_id": CONTACTS_BOARD_ID,
        "active_only": True,
        "rows_scanned": len(rows),
        "updates_planned": len(updates),
        "updates_applied": applied,
        "errors": errors or [],
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return {"csv": csv_path, "json": json_path}


def compute_audit_counts(rows: list[EstimatingRow]) -> dict[str, Any]:
    total = len(rows)

    # Contacts audit buckets: direct vs legacy fallback vs unresolved
    contacts_direct = sum(1 for r in rows if len(r.direct_contact_ids) > 0)
    contacts_legacy_only = sum(
        1
        for r in rows
        if len(r.direct_contact_ids) == 0 and len(r.legacy_contact_ids) > 0
    )
    contacts_unresolved = sum(
        1
        for r in rows
        if len(r.direct_contact_ids) == 0 and len(r.legacy_contact_ids) == 0
    )

    # Contractors audit buckets (direct vs relation fallback (via any contacts) vs unresolved)
    contractors_direct = sum(1 for r in rows if len(r.direct_contractor_ids) > 0)
    contractors_contact_fallback_possible = sum(
        1
        for r in rows
        if len(r.direct_contractor_ids) == 0
        and (len(r.direct_contact_ids) > 0 or len(r.legacy_contact_ids) > 0)
    )
    contractors_unresolved = sum(
        1
        for r in rows
        if len(r.direct_contractor_ids) == 0
        and len(r.direct_contact_ids) == 0
        and len(r.legacy_contact_ids) == 0
    )

    return {
        "total": total,
        "contacts": {
            "direct": contacts_direct,
            "legacy_only": contacts_legacy_only,
            "unresolved": contacts_unresolved,
        },
        "contractors": {
            "direct": contractors_direct,
            "contact_fallback_possible": contractors_contact_fallback_possible,
            "unresolved": contractors_unresolved,
        },
    }


def _print_audit(title: str, audit: dict[str, Any]) -> None:
    total = audit["total"]
    c = audit["contacts"]
    a = audit["contractors"]

    def pct(n: int) -> str:
        return f"{(n / total * 100):.2f}%" if total else "0.00%"

    print(f"\n{title}")
    print(f"  total evaluated: {total}")
    print("  contacts:")
    print(f"    direct:      {c[direct]:6d} ({pct(c[direct])})")
    print(f"    legacy_only: {c[legacy_only]:6d} ({pct(c[legacy_only])})")
    print(f"    unresolved:  {c[unresolved]:6d} ({pct(c[unresolved])})")
    print("  contractors:")
    print(f"    direct:                   {a[direct]:6d} ({pct(a[direct])})")
    print(f"    contact_fallback_possible: {a[contact_fallback_possible]:6d} ({pct(a[contact_fallback_possible])})")
    print(f"    unresolved:               {a[unresolved]:6d} ({pct(a[unresolved])})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply updates (default: dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Dry run (default)")
    parser.add_argument("--active-only", action="store_true", help="Skip known non-production groups")
    parser.add_argument("--limit", type=int, default=None, help="Limit items scanned (debug)")
    parser.add_argument("--no-contacts", action="store_true", help="Skip Contacts - Direct backfill")
    parser.add_argument("--no-contractors", action="store_true", help="Skip Contractors - Direct backfill")
    parser.add_argument("--write-delay", type=float, default=0.20, help="Seconds to sleep between writes")

    args = parser.parse_args()

    # Default is dry-run unless --apply explicitly set.
    apply_mode = bool(args.apply)

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

    token = _load_monday_token(repo_root)

    do_contacts = not args.no_contacts
    do_contractors = not args.no_contractors

    rows = fetch_estimating_rows(token, active_only=bool(args.active_only), limit=args.limit)
    audit_before = compute_audit_counts(rows)
    _print_audit("Audit (Before)", audit_before)

    # Build contact->account mapping only if needed.
    needed_contact_ids: set[int] = set()
    if do_contractors:
        for r in rows:
            if len(r.direct_contractor_ids) > 0:
                continue
            # Use either contact source; backfill contacts can happen independently.
            needed_contact_ids.update(r.direct_contact_ids)
            needed_contact_ids.update(r.legacy_contact_ids)

    contact_account_map = fetch_contact_account_map(token, needed_contact_ids) if needed_contact_ids else {}

    updates = plan_updates(rows, contact_account_map, do_contacts=do_contacts, do_contractors=do_contractors)

    planned_contacts = sum(1 for u in updates if u.new_direct_contact_ids is not None)
    planned_contractors = sum(1 for u in updates if u.new_direct_contractor_ids is not None)

    print("\nPlanned updates:")
    print(f"  total items to update: {len(updates)}")
    print(f"  contacts direct updates: {planned_contacts}")
    print(f"  contractors direct updates: {planned_contractors}")

    stamp = _now_stamp()

    applied: int | None = None
    errors: list[str] | None = None

    if apply_mode:
        print("\nApplying updates to Monday...")
        applied, errors = apply_updates(token, updates, write_delay_s=float(args.write_delay))
        print(f"  applied: {applied}")
        if errors:
            print(f"  errors: {len(errors)}")

        # Re-fetch to compute after-audit.
        rows_after = fetch_estimating_rows(token, active_only=bool(args.active_only), limit=args.limit)
        audit_after = compute_audit_counts(rows_after)
        _print_audit("Audit (After)", audit_after)

    report_paths = write_reports(repo_root, stamp, rows, updates, applied=applied, errors=errors)
    print("\nReports:")
    print("  " + report_paths["csv"])
    print("  " + report_paths["json"])

    # If there were errors, return non-zero so automation catches it.
    if errors:
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

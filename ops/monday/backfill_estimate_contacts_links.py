#!/usr/bin/env python3
"""Backfill canonical estimate<->contact links into Postgres.

Source of truth for link discovery:
- Monday Estimating board direct contacts column: board_relation_mm065k5n
- Monday Estimating board legacy contacts column: deal_contact

Destination:
- public.estimate_contacts (estimate_id, contact_id, source)

This script reads current Monday relations, maps Monday item IDs to local
Postgres IDs (estimates.id / contacts.id), and upserts the join table.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import pathlib
import subprocess
import time
import urllib.request
from typing import Any

MONDAY_API_URL = "https://api.monday.com/v2"
MONDAY_API_VERSION = "2026-01"

ESTIMATING_BOARD_ID = 7_943_937_851
COL_CONTACTS_DIRECT = "board_relation_mm065k5n"
COL_CONTACTS_LEGACY = "deal_contact"

NON_PROD_GROUPS = {
    "Shell Estimates ( Do Not Move)",
    "Sales Team Estimates",
}

CONTAINER_DB = "supabase_db_desert-services-hub"


def now_stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_monday_api_key(repo_root: pathlib.Path) -> str:
    env_val = os.environ.get("MONDAY_API_KEY")
    if env_val:
        return env_val.strip()

    env_path = repo_root / ".env"
    if not env_path.exists():
        raise RuntimeError(f"Missing .env at {env_path}")

    with env_path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("MONDAY_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"')

    raise RuntimeError("MONDAY_API_KEY not found in .env")


def monday_query(token: str, graphql_query: str) -> dict[str, Any]:
    req = urllib.request.Request(
        MONDAY_API_URL,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": token,
            "API-Version": MONDAY_API_VERSION,
        },
        data=json.dumps({"query": graphql_query}).encode("utf-8"),
    )

    with urllib.request.urlopen(req, timeout=90) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    if payload.get("errors"):
        raise RuntimeError(f"Monday GraphQL error: {payload['errors'][0]}")

    data = payload.get("data")
    if data is None:
        raise RuntimeError("Monday GraphQL response missing data")
    return data


def monday_query_retry(token: str, graphql_query: str) -> dict[str, Any]:
    delay = 2.0
    for attempt in range(1, 6):
        try:
            return monday_query(token, graphql_query)
        except Exception as err:
            msg = str(err).lower()
            retryable = any(x in msg for x in ("timeout", "429", "503", "504", "rate"))
            if attempt < 5 and retryable:
                time.sleep(delay * attempt)
                continue
            raise
    raise RuntimeError("unreachable")


def parse_linked_ids(col: dict[str, Any]) -> list[str]:
    ids = col.get("linked_item_ids")
    if not ids:
        return []

    out: list[str] = []
    for raw in ids:
        s = str(raw).strip()
        if s.isdigit():
            out.append(s)
    return sorted(set(out))


def fetch_monday_estimate_contact_pairs(token: str, *, active_only: bool) -> tuple[dict[tuple[str, str], str], dict[str, int]]:
    """Return mapping: (estimate_monday_id, contact_monday_id) -> source."""
    pairs: dict[tuple[str, str], str] = {}
    stats = {
        "items_seen": 0,
        "items_kept": 0,
        "pairs_direct": 0,
        "pairs_legacy": 0,
    }

    cursor: str | None = None
    while True:
        cursor_part = f", cursor: {json.dumps(cursor)}" if cursor else ""
        query = f"""
        query {{
          boards(ids: {ESTIMATING_BOARD_ID}) {{
            items_page(limit: 200{cursor_part}) {{
              cursor
              items {{
                id
                group {{ title }}
                column_values(ids: ["{COL_CONTACTS_DIRECT}", "{COL_CONTACTS_LEGACY}"]) {{
                  id
                  ... on BoardRelationValue {{
                    linked_item_ids
                  }}
                }}
              }}
            }}
          }}
        }}
        """

        data = monday_query_retry(token, query)
        page = data["boards"][0]["items_page"]
        items = page.get("items") or []

        for item in items:
            stats["items_seen"] += 1
            group_title = ((item.get("group") or {}).get("title") or "").strip()
            if active_only and group_title in NON_PROD_GROUPS:
                continue

            stats["items_kept"] += 1
            estimate_id = str(item["id"])
            by_id = {c["id"]: c for c in (item.get("column_values") or [])}

            direct_ids = parse_linked_ids(by_id.get(COL_CONTACTS_DIRECT, {}))
            legacy_ids = parse_linked_ids(by_id.get(COL_CONTACTS_LEGACY, {}))

            for contact_id in direct_ids:
                key = (estimate_id, contact_id)
                pairs[key] = "monday.direct_contacts"
                stats["pairs_direct"] += 1

            for contact_id in legacy_ids:
                key = (estimate_id, contact_id)
                if key not in pairs:
                    pairs[key] = "monday.legacy_deal_contact"
                stats["pairs_legacy"] += 1

        cursor = page.get("cursor")
        if not cursor:
            break

    return pairs, stats


def run_psql(sql: str, *, tabular: bool = False) -> str:
    cmd = [
        "docker",
        "exec",
        "-i",
        CONTAINER_DB,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
    ]
    if tabular:
        cmd += ["-At", "-F", "\t"]
    cmd += ["-c", sql]

    proc = subprocess.run(
        cmd,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "psql failed")
    return proc.stdout


def fetch_id_map(table: str, monday_col: str) -> dict[str, int]:
    out = run_psql(
        f"SELECT id, {monday_col} FROM public.{table} WHERE {monday_col} IS NOT NULL;",
        tabular=True,
    )
    mapping: dict[str, int] = {}
    for line in out.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) != 2:
            continue
        local_id_s, monday_id_s = parts
        local_id_s = local_id_s.strip()
        monday_id_s = monday_id_s.strip()
        if local_id_s.isdigit() and monday_id_s:
            mapping[monday_id_s] = int(local_id_s)
    return mapping


def sql_quote(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


def upsert_estimate_contacts(rows: list[tuple[int, int, str]]) -> tuple[int, int]:
    """Returns (before_count, after_count)."""
    before = int(
        run_psql("SELECT COUNT(*) FROM public.estimate_contacts;", tabular=True)
        .strip()
        .splitlines()[0]
    )

    if rows:
        batch_size = 500
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            values = ",\n".join(
                f"({estimate_id}, {contact_id}, {sql_quote(source)})"
                for estimate_id, contact_id, source in batch
            )
            sql = f"""
            INSERT INTO public.estimate_contacts (estimate_id, contact_id, source)
            VALUES
            {values}
            ON CONFLICT (estimate_id, contact_id) DO UPDATE
            SET source = CASE
              WHEN EXCLUDED.source = 'monday.direct_contacts' THEN EXCLUDED.source
              ELSE public.estimate_contacts.source
            END;
            """
            run_psql(sql)

    after = int(
        run_psql("SELECT COUNT(*) FROM public.estimate_contacts;", tabular=True)
        .strip()
        .splitlines()[0]
    )
    return before, after


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--active-only", action="store_true", help="Skip non-production estimate groups")
    args = parser.parse_args()

    repo_root = pathlib.Path(__file__).resolve().parents[2]
    token = load_monday_api_key(repo_root)

    monday_pairs, monday_stats = fetch_monday_estimate_contact_pairs(
        token,
        active_only=bool(args.active_only),
    )

    estimate_map = fetch_id_map("estimates", "monday_item_id")
    contact_map = fetch_id_map("contacts", "monday_item_id")

    resolved_rows: list[tuple[int, int, str]] = []
    missing_estimate = 0
    missing_contact = 0

    for (estimate_monday_id, contact_monday_id), source in monday_pairs.items():
        estimate_id = estimate_map.get(estimate_monday_id)
        contact_id = contact_map.get(contact_monday_id)
        if estimate_id is None:
            missing_estimate += 1
            continue
        if contact_id is None:
            missing_contact += 1
            continue
        resolved_rows.append((estimate_id, contact_id, source))

    dedup: dict[tuple[int, int], str] = {}
    for estimate_id, contact_id, source in resolved_rows:
        key = (estimate_id, contact_id)
        current = dedup.get(key)
        if current == "monday.direct_contacts":
            continue
        if source == "monday.direct_contacts" or current is None:
            dedup[key] = source

    resolved_rows = [(e, c, s) for (e, c), s in sorted(dedup.items())]

    before_count, after_count = upsert_estimate_contacts(resolved_rows)

    stamp = now_stamp()
    out_dir = repo_root / "data" / "backfill-runs"
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / f"estimate-contacts-backfill.{stamp}.csv"
    json_path = out_dir / f"estimate-contacts-backfill.{stamp}.json"

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["estimate_id", "contact_id", "source"])
        writer.writerows(resolved_rows)

    summary = {
        "stamp": stamp,
        "active_only": bool(args.active_only),
        "monday_items_seen": monday_stats["items_seen"],
        "monday_items_kept": monday_stats["items_kept"],
        "monday_pairs_direct": monday_stats["pairs_direct"],
        "monday_pairs_legacy": monday_stats["pairs_legacy"],
        "monday_pairs_unique": len(monday_pairs),
        "resolved_rows": len(resolved_rows),
        "missing_estimate": missing_estimate,
        "missing_contact": missing_contact,
        "table_count_before": before_count,
        "table_count_after": after_count,
        "table_added": after_count - before_count,
        "csv": str(csv_path),
    }

    with json_path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

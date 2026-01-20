#!/usr/bin/env python3
"""
Build the canonical accounts database by combining all analysis data.
Creates SQLite database with canonical_accounts, account_variants, and account_contacts tables.
"""

import csv
import json
import sqlite3
from pathlib import Path
from typing import Optional

def calculate_confidence_score(
    qb_match: bool,
    sp_match: bool,
    monday_match: bool,
    is_garbage: bool,
    system_count: int = 0
) -> tuple[float, str]:
    """
    Calculate confidence score and level based on system matches.

    HIGH (0.9+): Matched in 2+ existing systems
    MEDIUM (0.7-0.9): Matched in 1 system
    LOW (<0.7): No matches but valid name
    GARBAGE (0): Flagged as garbage
    """
    if is_garbage:
        return 0.0, "GARBAGE"

    match_count = sum([qb_match, sp_match, monday_match])

    if match_count >= 2:
        return 0.95, "HIGH"
    elif match_count == 1:
        return 0.75, "MEDIUM"
    else:
        return 0.5, "LOW"


def load_accounts_final(csv_path: str) -> dict:
    """Load accounts_final.csv into a dictionary keyed by canonical_name."""
    accounts = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            accounts[row['base_name'].lower()] = {
                'id': row['id'],
                'base_name': row['base_name'],
                'display_name': row['display_name'],
                'total_records': int(row['total_records']),
                'variant_count': int(row['variant_count']),
                'source_count': int(row['source_count']),
                'variants': row['all_variants_pipe_separated'].split(' | ') if row['all_variants_pipe_separated'] else []
            }
    return accounts


def load_qb_matches(csv_path: str) -> dict:
    """Load QuickBooks matches."""
    matches = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            canonical = row['canonical_name'].lower()
            matches[canonical] = {
                'qb_company_name': row['qb_company_name'],
                'qb_customer_id': row['qb_customer_id'],
                'match_type': row['match_type']
            }
    return matches


def load_sp_matches(csv_path: str) -> dict:
    """Load SharePoint matches."""
    matches = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            canonical = row['canonical_name'].lower()
            matches[canonical] = {
                'sp_id': row['sp_id'],
                'sp_name': row['sp_name'],
                'sp_folder': row['sp_folder'],
                'match_type': row['match_type']
            }
    return matches


def load_monday_matches(csv_path: str) -> dict:
    """Load Monday matches."""
    matches = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            canonical = row['canonical_name'].lower()
            matches[canonical] = {
                'monday_id': row['monday_id'],
                'monday_name': row['monday_name'],
                'match_type': row['match_type']
            }
    return matches


def load_garbage_entries(csv_path: str) -> dict:
    """Load garbage entries to flag."""
    garbage = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            canonical = row['canonical_name'].lower()
            garbage[canonical] = {
                'display_name': row['display_name'],
                'reason': row['garbage_reason']
            }
    return garbage


def load_wos_status(csv_path: str) -> dict:
    """Load WOS status for contractors."""
    status = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row['contractor_name']:
                continue
            name_key = row['contractor_name'].lower()
            has_wos = row.get('has_wos_certs', 'false')
            has_non_wos = row.get('has_non_wos_certs', 'false')
            status[name_key] = {
                'has_wos_certs': (has_wos or 'false').lower() == 'true',
                'has_non_wos_certs': (has_non_wos or 'false').lower() == 'true',
                'total_certs': int(row.get('total_certs', 0) or 0),
                'likely_current_status': row.get('likely_current_status', 'UNKNOWN')
            }
    return status


def extract_contacts_from_variants(variants: list) -> list:
    """Extract contact information from variant names."""
    contacts = []
    for variant in variants:
        variant_lower = variant.lower()

        # Extract phone numbers (pattern: digits like 602-123-4567 or (123) 456-7890)
        import re
        phone_pattern = r'\b(?:\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s*\d{3}[-.\s]?\d{4})\b'
        phones = re.findall(phone_pattern, variant)
        for phone in phones:
            contacts.append({
                'contact_name': '',
                'phone': phone,
                'email': '',
                'source': variant
            })

        # Extract emails (pattern: text@domain.com)
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        emails = re.findall(email_pattern, variant)
        for email in emails:
            contacts.append({
                'contact_name': '',
                'phone': '',
                'email': email,
                'source': variant
            })

    return contacts


def main():
    base_path = Path('/Users/chiejimofor/Documents/Github/desert-services-hub/projects/accounts/data')

    # Load all data sources
    print("Loading data sources...")
    accounts = load_accounts_final(base_path / 'canonical' / 'accounts_final.csv')
    qb_matches = load_qb_matches(base_path / 'links' / 'qb_matches.csv')
    sp_matches = load_sp_matches(base_path / 'links' / 'sharepoint_matches.csv')
    monday_matches = load_monday_matches(base_path / 'links' / 'monday_matches.csv')
    garbage_entries = load_garbage_entries(base_path / 'canonical' / 'garbage_entries.csv')
    wos_status = load_wos_status(base_path / 'canonical' / 'contractor_wos_status.csv')

    # Create database
    db_path = base_path / 'canonical_accounts.db'
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Drop existing tables if they exist
    cursor.execute('DROP TABLE IF EXISTS account_contacts')
    cursor.execute('DROP TABLE IF EXISTS account_variants')
    cursor.execute('DROP TABLE IF EXISTS canonical_accounts')

    # Create canonical_accounts table
    print("Creating canonical_accounts table...")
    cursor.execute('''
        CREATE TABLE canonical_accounts (
            id INTEGER PRIMARY KEY,
            canonical_name TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            record_count INTEGER NOT NULL DEFAULT 0,
            variant_count INTEGER NOT NULL DEFAULT 0,
            wos_status TEXT,
            qb_customer_id TEXT,
            qb_company_name TEXT,
            sp_id TEXT,
            sp_name TEXT,
            monday_id TEXT,
            monday_name TEXT,
            confidence_score REAL NOT NULL,
            confidence_level TEXT NOT NULL,
            is_garbage BOOLEAN NOT NULL DEFAULT 0,
            garbage_reason TEXT,
            notes TEXT
        )
    ''')

    # Create account_variants table
    print("Creating account_variants table...")
    cursor.execute('''
        CREATE TABLE account_variants (
            id INTEGER PRIMARY KEY,
            canonical_id INTEGER NOT NULL,
            variant_name TEXT NOT NULL,
            source_file TEXT,
            FOREIGN KEY (canonical_id) REFERENCES canonical_accounts(id)
        )
    ''')

    # Create account_contacts table
    print("Creating account_contacts table...")
    cursor.execute('''
        CREATE TABLE account_contacts (
            id INTEGER PRIMARY KEY,
            canonical_id INTEGER NOT NULL,
            contact_name TEXT,
            phone TEXT,
            email TEXT,
            source TEXT,
            FOREIGN KEY (canonical_id) REFERENCES canonical_accounts(id)
        )
    ''')

    # Populate canonical_accounts
    print("Populating canonical_accounts...")
    canonical_id_map = {}
    stats = {
        'total_accounts': 0,
        'high_confidence': 0,
        'medium_confidence': 0,
        'low_confidence': 0,
        'garbage': 0,
        'total_variants': 0,
        'total_contacts': 0
    }

    for idx, (canonical_key, account_data) in enumerate(accounts.items(), 1):
        canonical_name = account_data['base_name']
        is_garbage = canonical_key in garbage_entries

        qb_data = qb_matches.get(canonical_key, {})
        sp_data = sp_matches.get(canonical_key, {})
        monday_data = monday_matches.get(canonical_key, {})

        qb_match = bool(qb_data.get('qb_customer_id'))
        sp_match = bool(sp_data.get('sp_id'))
        monday_match = bool(monday_data.get('monday_id'))

        confidence_score, confidence_level = calculate_confidence_score(
            qb_match, sp_match, monday_match, is_garbage
        )

        # Get WOS status
        wos_status_lookup = wos_status.get(canonical_key, {})
        wos_status_text = wos_status_lookup.get('likely_current_status', 'UNKNOWN')

        garbage_reason = ''
        if is_garbage:
            garbage_reason = garbage_entries[canonical_key]['reason']

        cursor.execute('''
            INSERT INTO canonical_accounts (
                id, canonical_name, display_name, record_count, variant_count,
                wos_status, qb_customer_id, qb_company_name, sp_id, sp_name,
                monday_id, monday_name, confidence_score, confidence_level,
                is_garbage, garbage_reason, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            idx,
            canonical_name,
            account_data['display_name'],
            account_data['total_records'],
            account_data['variant_count'],
            wos_status_text if not is_garbage else None,
            qb_data.get('qb_customer_id', ''),
            qb_data.get('qb_company_name', ''),
            sp_data.get('sp_id', ''),
            sp_data.get('sp_name', ''),
            monday_data.get('monday_id', ''),
            monday_data.get('monday_name', ''),
            confidence_score,
            confidence_level,
            1 if is_garbage else 0,
            garbage_reason,
            f"Match types - QB: {qb_data.get('match_type', 'NONE')}, SP: {sp_data.get('match_type', 'NONE')}, Monday: {monday_data.get('match_type', 'NONE')}"
        ))

        canonical_id_map[canonical_key] = idx

        # Track stats
        stats['total_accounts'] += 1
        if confidence_level == 'HIGH':
            stats['high_confidence'] += 1
        elif confidence_level == 'MEDIUM':
            stats['medium_confidence'] += 1
        elif confidence_level == 'LOW':
            stats['low_confidence'] += 1
        elif confidence_level == 'GARBAGE':
            stats['garbage'] += 1

    # Populate account_variants
    print("Populating account_variants...")
    for canonical_key, account_data in accounts.items():
        canonical_id = canonical_id_map[canonical_key]
        for variant in account_data['variants']:
            cursor.execute('''
                INSERT INTO account_variants (canonical_id, variant_name, source_file)
                VALUES (?, ?, ?)
            ''', (canonical_id, variant.strip(), 'accounts_final.csv'))
            stats['total_variants'] += 1

    # Populate account_contacts
    print("Populating account_contacts...")
    for canonical_key, account_data in accounts.items():
        canonical_id = canonical_id_map[canonical_key]
        contacts = extract_contacts_from_variants(account_data['variants'])
        for contact in contacts:
            if contact['phone'] or contact['email']:
                cursor.execute('''
                    INSERT INTO account_contacts (
                        canonical_id, contact_name, phone, email, source
                    ) VALUES (?, ?, ?, ?, ?)
                ''', (
                    canonical_id,
                    contact['contact_name'],
                    contact['phone'],
                    contact['email'],
                    contact['source']
                ))
                stats['total_contacts'] += 1

    conn.commit()
    conn.close()

    print("\n" + "="*60)
    print("CANONICAL ACCOUNTS DATABASE CREATED SUCCESSFULLY")
    print("="*60)
    print(f"\nDatabase: {db_path}")
    print(f"\nDatabase Statistics:")
    print(f"  Total Canonical Accounts: {stats['total_accounts']}")
    print(f"  - HIGH confidence (2+ systems): {stats['high_confidence']}")
    print(f"  - MEDIUM confidence (1 system): {stats['medium_confidence']}")
    print(f"  - LOW confidence (0 systems): {stats['low_confidence']}")
    print(f"  - GARBAGE (flagged entries): {stats['garbage']}")
    print(f"\n  Total Account Variants: {stats['total_variants']}")
    print(f"  Total Contact Records: {stats['total_contacts']}")

    # Show top 10 accounts
    print(f"\nTop 10 Canonical Accounts by Record Count:")
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    cursor.execute('''
        SELECT canonical_name, display_name, record_count, confidence_level
        FROM canonical_accounts
        WHERE is_garbage = 0
        ORDER BY record_count DESC
        LIMIT 10
    ''')
    for i, row in enumerate(cursor.fetchall(), 1):
        print(f"  {i:2d}. {row[1]:30s} ({row[2]:3d} records, {row[3]} confidence)")

    # Show confidence distribution
    print(f"\nConfidence Score Distribution:")
    cursor.execute('''
        SELECT confidence_level, COUNT(*) as count
        FROM canonical_accounts
        GROUP BY confidence_level
        ORDER BY count DESC
    ''')
    for row in cursor.fetchall():
        print(f"  {row[0]:15s}: {row[1]:4d} accounts")

    # Show top contacts by frequency
    print(f"\nTop 10 Extracted Contacts:")
    cursor.execute('''
        SELECT ac.contact_name, ac.phone, ac.email, ca.canonical_name, COUNT(*) as freq
        FROM account_contacts ac
        JOIN canonical_accounts ca ON ac.canonical_id = ca.id
        WHERE ac.phone != '' OR ac.email != ''
        GROUP BY ac.phone, ac.email
        ORDER BY freq DESC
        LIMIT 10
    ''')
    for i, row in enumerate(cursor.fetchall(), 1):
        contact_info = row[1] or row[2]
        print(f"  {i:2d}. {contact_info:25s} ({row[3]}, {row[4]} references)")

    conn.close()


if __name__ == '__main__':
    main()

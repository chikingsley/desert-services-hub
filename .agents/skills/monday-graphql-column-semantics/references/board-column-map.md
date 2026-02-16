# Monday Board/Column Map (Desert Services)

Updated from live workspace audit on 2026-02-07.

Workspace:
- `8970676` (`Desert Services`)

Boards:
- Estimating: `7943937851`
- Leads: `7943937841`
- Projects: `8692330900`
- Dust Permits: `9850624269`
- SWPPP Plans: `9778304069`
- Inspection Reports: `8791849123`
- Contractors: `7943937856`
- Contacts: `7943937855`
- Service Lines: `8686470518`

## High-Impact Relations And Mirrors

Estimating:
- `board_relation_mkzdd0r4` Contractors - Direct
- `board_relation_mm065k5n` Contacts - Direct
- `deal_contact` Contacts (legacy relation)
- `deal_account` Contractor (mirror from contacts->contractor chain)
- `board_relation_mktgzr87` Service Lines
- `board_relation_mktgebxf` link to Projects
- `board_relation_mkxm6jb1` Dust Permits

Leads:
- `board_relation_mktg3z60` Estimate Name (core relation)
- `lookup_mktg8b1z` Bid Status (mirror from Estimate)
- `lookup_mktgymd0` Contractor (mirror from Estimate)
- `lookup_mktg16w4` Bid Value (mirror from Estimate)
- `color_mm068kjz` Overall Status

Projects:
- `board_relation_mktgn7cb` Linked Estimate
- `board_relation_mkp8pr9e` Service Lines (direct)
- `lookup_mktg3b6w` Service Lines (mirror via linked estimate)
- `board_relation_mkpf1kvf` Inspection Reports
- `lookup_mktgnedy` Account (mirror via linked estimate)
- `lookup_mktgs814` Contact (mirror via linked estimate)

Dust Permits:
- `board_relation_mkxmhqdf` Estimate
- `board_relation_mkxfk8ky` Contractors (direct)
- `board_relation_mkxmh6zg` Contacts (direct)
- `lookup_mkxp5f5n` Account (mirror via estimate)
- `lookup_mkxpsgqk` Contacts (mirror via estimate)

Inspection Reports:
- `board_relation_mkpfq0mk` Project
- `lookup_mkrws4a7` Location (mirror from project)
- `lookup_mkqy8nyj` Account (mirror, currently low/zero usage)
- `board_relation_mkz5x9hg` Contacts (currently low/zero usage)

Contractors:
- `account_contact` Contacts
- `board_relation_mkzd8h88` link to Estimating

Contacts:
- `contact_account` Contractor
- `board_relation_mkp8e0s2` Projects

Service Lines:
- `board_relation_mkp8rqas` link to Projects

## Semantics Notes

- “Direct” means the relation stores target item ids directly in the cell (`linked_item_ids`).
- “Mirror” means display-only projection from another board/column chain.
- UI-visible mirror values are often not represented in `text`; use `display_value`.

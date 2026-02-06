# Monday.com ESTIMATING Board - ACTUAL Current Columns

**Fetched live from Monday.com API on 2026-02-02**

## All 45 Columns in Order (As Returned by API)

- `name` - Name
- `subitems` - Tasks
- `deal_owner` - Owner
- `deal_contact` - Contacts
- `deal_account` - Contractor
- `date_mksf70mc` - Due Date
- `location_mksej8dy` - Location
- `color_mksetd6e` - Bid Source
- `deal_stage` - Bid Status
- `file_mkseqmab` - Plans
- `board_relation_mktgzr87` - Service Lines
- `text_mkseybgg` - Estimate ID
- `deal_value` - Bid Value
- `file_mksebs2e` - Estimate
- `file_mkxs157q` - Contracts
- `file_mkxskqtt` - NOI
- `deal_actual_value` - Awarded Value
- `deal_close_date` - Close Date
- `date_mktggxm` - Project Start Date
- `color_mktmdrgk` - SWPP Plan
- `date_mktgw5mt` - Project End Date
- `board_relation_mktg153g` - Onsite Contact
- `board_relation_mktgebxf` - link to Projects
- `deal_close_probability` - Close Probability
- `board_relation_mktga7k4` - Sales Contact
- `deal_creation_date` - Deal Creation Date
- `deal_forecast_value` - Forecast Value
- `boolean_mkth6sm9` - Awarded
- `text_mkvwmacx` - Field Sales Referrer
- `board_relation_mkvwwg0w` - Field Opportunity
- `lookup_mkx1js5e` - Project Owner
- `board_relation_mkxm6jb1` - Dust Permits
- `link_mky1n6pa` - SharePoint URL
- `board_relation_mkzdd0r4` - Contractors - Direct
- `board_relation_mm065k5n` - Contacts - Direct
- `date_mksfz5mn` - Bid Sent Date
- `pulse_log_mm06jxxk` - Creation log
- `formula_mm063qae` - Sent to Closed
- `formula_mm06d2ra` - Created to Sent
- `board_relation_mm06235j` - link to Leads
- `lookup_mm06pwsa` - Mirror

## What estimates.ts Currently Syncs

- `name` - Name
- `id` - Item ID
- `groupId` - Group ID
- `groupTitle` - Group title
- `url` - Monday.com URL
- `text_mkseybgg` - Estimate ID
- `deal_account` - Contractor
- `board_relation_mkzdd0r4` - Contractors - Direct (ACCOUNTS)
- `deal_stage` - Bid Status
- `deal_value` - Bid Value
- `deal_actual_value` - Awarded Value
- `color_mksetd6e` - Bid Source
- `boolean_mkth6sm9` - Awarded
- `date_mksf70mc` - Due Date
- `location_mksej8dy` - Location
- `link_mky1n6pa` - SharePoint URL
- `accountDomain` - Account Domain (derived from CONTRACTORS board lookup)

## What Worker CLI Currently Uses

- `name` - Name
- `id` - Item ID
- `groupId` - Group ID
- `groupTitle` - Group title
- `url` - Monday.com URL
- `deal_stage` - Bid Status
- `link_mky1n6pa` - SharePoint URL
- `deal_account` - Contractor (mirror)
- `board_relation_mkzdd0r4` - Contractors - Direct (ACCOUNTS)
- `deal_contact` - Contacts
- `file_mksebs2e` - Estimate
- `file_mkseqmab` - Plans
- `file_mkxs157q` - Contracts
- `file_mkxskqtt` - NOI

## To Replace estimates.ts Bar-for-Bar

Worker CLI needs to sync these 17 fields:

- `monday_item_id` (item.id)
- `name` (item.name)
- `estimate_number` (`text_mkseybgg`)
- `contractor` (`deal_account` mirror)
- `group_id` (item.groupId)
- `group_title` (item.groupTitle)
- `monday_url` (item.url)
- `account_monday_id` (from `board_relation_mkzdd0r4`)
- `account_domain` (derived from CONTRACTORS board lookup)
- `bid_status` (`deal_stage`)
- `bid_value` (`deal_value`)
- `awarded_value` (`deal_actual_value`)
- `bid_source` (`color_mksetd6e`)
- `awarded` (`boolean_mkth6sm9`)
- `due_date` (`date_mksf70mc`)
- `location` (`location_mksej8dy`)
- `sharepoint_url` (`link_mky1n6pa`)

Plus file handling: All files from ESTIMATE, PLANS, CONTRACTS, NOI columns (not just first PDF)

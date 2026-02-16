# Variable Inventory Report (Eva -> Jayson Narratives)

Inventory directory: `packages/narratives/data/intake/eva-to-jayson/variable-inventory`

## Counts

- Docs scanned: **202** (docs.tsv rows)
- Distinct extracted keys: **261**
- Keys that vary across docs: **128**
- Keys that are constant across docs: **133**

## Canonical MVP Fields

This collapses duplicated fields across TITLE/Section 1/Section 8 into a smaller list.
Machine-readable list: `CANONICAL_MVP.tsv`
Per-doc canonical values: `CANONICAL_DOCS.tsv`

### Project

- `project.name`: Project name (covered_docs=196, unique=186)
sources: `1.1 Project/Site Information.UNLABELED.project_name`, `SECTION 8: CERTIFICATION AND NOTIFICATION.Project Name`, `SECTION 8: CERTIFICATION AND NOTIFICATION.Project Title`
- `project.address_line1`: Project address line 1 (covered_docs=196, unique=187)
sources: `1.1 Project/Site Information.UNLABELED.address_line1`, `TITLE.SWPPP Contact(s).Line2`, `1.2 Contact Information/Responsable Parties.Project Manager.Line2`
- `project.city_state_zip`: Project city/state/zip (single line) (covered_docs=196, unique=111)
sources: `1.1 Project/Site Information.UNLABELED.address_line2`, `TITLE.SWPPP Contact(s).Line3`, `1.2 Contact Information/Responsable Parties.Project Manager.Line3`
- `project.city`: Project city (derived) (covered_docs=180, unique=29)
sources: (derived)
- `project.state`: Project state (derived) (covered_docs=180, unique=1)
sources: (derived)
- `project.zip`: Project zip (derived) (covered_docs=180, unique=89)
sources: (derived)
- `project.county`: County (covered_docs=190, unique=3)
sources: `1.1 Project/Site Information.County or Similar Subdivision`

### Permit

- `permit.azpdes_number`: AZPDES tracking number (covered_docs=108, unique=100)
sources: `1.1 Project/Site Information.AZPDES project or permit tracking number*`, `TITLE.SWPPP Contact(s).AZPDES number`
- `permit.azcon_number`: AZCON tracking number (covered_docs=87, unique=85)
sources: `1.1 Project/Site Information.AZCON project or permit tracking number*`, `TITLE.SWPPP Contact(s).AZCON number`
- `permit.number_best_effort`: Permit number (best-effort AZPDES/AZCON) (covered_docs=195, unique=185)
sources: (derived)

### Dates

- `dates.swppp_preparation_date`: SWPPP preparation date (covered_docs=196, unique=102)
sources: `TITLE.SWPPP Contact(s).SWPPP Preparation Date`
- `dates.project_start`: Estimated project start date (covered_docs=196, unique=126)
sources: `1.3 Nature and Sequence of Construction Activity.Estimated Project Start Date`, `TITLE.SWPPP Contact(s).Project Start Date`
- `dates.project_completion`: Estimated project completion date (covered_docs=196, unique=12)
sources: `1.3 Nature and Sequence of Construction Activity.Estimated Project Completion Date`

### Contacts

- `operator.company`: Operator company (covered_docs=196, unique=111)
sources: `1.2 Contact Information/Responsable Parties.Operator(s).Line1`, `TITLE.Operator(s).Line1`
- `operator.contact_name`: Operator contact name (covered_docs=196, unique=165)
sources: `1.2 Contact Information/Responsable Parties.Operator(s).Contact`, `TITLE.Operator(s).Contact`
- `operator.phone`: Operator phone (covered_docs=196, unique=160)
sources: `1.2 Contact Information/Responsable Parties.Operator(s).Phone`, `TITLE.Operator(s).Phone`, `TITLE.Phone`
- `operator.email`: Operator email (best-effort scan) (covered_docs=120, unique=107)
sources: (derived)
- `operator.address_line1`: Operator address line 1 (covered_docs=196, unique=116)
sources: `1.2 Contact Information/Responsable Parties.Operator(s).Line2`, `TITLE.Operator(s).Line2`
- `operator.city_state_zip`: Operator city/state/zip (covered_docs=196, unique=74)
sources: `1.2 Contact Information/Responsable Parties.Operator(s).Line3`, `TITLE.Operator(s).Line3`
- `swppp_contact.name`: SWPPP contact name (best-effort) (covered_docs=196, unique=165)
sources: `TITLE.SWPPP Contact(s).Line1`, `1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Line1`
- `swppp_contact.phone`: SWPPP contact phone (covered_docs=196, unique=160)
sources: `1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Phone`, `TITLE.SWPPP Contact(s).Phone`, `TITLE.Phone`
- `emergency.contact_name`: Emergency 24-hour contact name (best-effort scan) (covered_docs=188, unique=163)
sources: (derived)
- `emergency.phone`: Emergency 24-hour phone (best-effort scan) (covered_docs=188, unique=157)
sources: (derived)

### Site Details

- `site.total_project_area_acres`: Total project area (acres; raw) (covered_docs=194, unique=146)
sources: `1.5 Construction Site Estimates.Total project area`
- `site.total_project_area_acres_number`: Total project area (acres; numeric derived) (covered_docs=194, unique=145)
sources: (derived)
- `site.disturbed_area_acres`: Disturbed area (acres; raw) (covered_docs=196, unique=146)
sources: `1.5 Construction Site Estimates.Construction site area to be disturbed`
- `site.disturbed_area_acres_number`: Disturbed area (acres; numeric derived) (covered_docs=196, unique=145)
sources: (derived)
- `site.soil_types`: Soil type(s) (covered_docs=196, unique=115)
sources: `1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Soil type(s)`
- `site.slopes`: Slopes (often blank) (covered_docs=110, unique=30)
sources: `1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Slopes`
- `site.receiving_waters`: Receiving waters (covered_docs=192, unique=66)
sources: `1.6 Receiving waters.Description of receiving waters`
- `site.storm_sewer_systems`: Storm sewer systems / MS4 (covered_docs=191, unique=41)
sources: `1.6 Receiving waters.Description of storm sewer systems`

### BMP (High Variance)

- `bmp.ec7.responsible_staff`: BMP EC-7 responsible staff (covered_docs=196, unique=118)
sources: `2.4 Stabilize Soils.BMP EC-7.Responsible Staff`
- `bmp.ec7.installation_schedule`: BMP EC-7 installation schedule (covered_docs=196, unique=1)
sources: `2.4 Stabilize Soils.BMP EC-7.Installation Schedule`
- `bmp.ec7.maintenance`: BMP EC-7 maintenance/inspection (covered_docs=196, unique=1)
sources: `2.4 Stabilize Soils.BMP EC-7.Maintenance and Inspection`

## Top High-Variance Keys (Raw Extraction)

These are individual extracted keys with high coverage and high variance (not yet deduped).

- `1.1 Project/Site Information.UNLABELED.address_line1` (docs=196, unique=187) [scope=1.1 Project/Site Information]
- `TITLE.SWPPP Contact(s).Line2` (docs=196, unique=187) [scope=TITLE]
- `1.1 Project/Site Information.UNLABELED.project_name` (docs=196, unique=186) [scope=1.1 Project/Site Information]
- `SECTION 8: CERTIFICATION AND NOTIFICATION.Project Name` (docs=196, unique=186) [scope=SECTION 8: CERTIFICATION AND NOTIFICATION]
- `SECTION 8: CERTIFICATION AND NOTIFICATION.Project Title` (docs=196, unique=186) [scope=SECTION 8: CERTIFICATION AND NOTIFICATION]
- `1.2 Contact Information/Responsable Parties.Project Manager.Line1` (docs=195, unique=183) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.Project Manager.Line2` (docs=195, unique=176) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Line1` (docs=196, unique=170) [scope=1.2 Contact Information/Responsable Parties]
- `SECTION 8: CERTIFICATION AND NOTIFICATION.SWPPP Contact` (docs=196, unique=166) [scope=SECTION 8: CERTIFICATION AND NOTIFICATION]
- `1.2 Contact Information/Responsable Parties.Operator(s).Contact` (docs=196, unique=165) [scope=1.2 Contact Information/Responsable Parties]
- `TITLE.SWPPP Contact(s).Line1` (docs=196, unique=165) [scope=TITLE]
- `TITLE.Phone` (docs=196, unique=164) [scope=TITLE]
- `SECTION 8: CERTIFICATION AND NOTIFICATION.Operator(s).Project Name` (docs=170, unique=164) [scope=SECTION 8: CERTIFICATION AND NOTIFICATION]
- `SECTION 8: CERTIFICATION AND NOTIFICATION.Operator(s).Project Location` (docs=169, unique=164) [scope=SECTION 8: CERTIFICATION AND NOTIFICATION]
- `1.5 Construction Site Estimates.Construction site area to be disturbed` (docs=196, unique=163) [scope=1.5 Construction Site Estimates]
- `1.5 Construction Site Estimates.Total project area` (docs=196, unique=163) [scope=1.5 Construction Site Estimates]
- `TITLE.SWPPP Contact(s).Phone` (docs=195, unique=163) [scope=TITLE]
- `TITLE.Operator(s).Contact` (docs=192, unique=161) [scope=TITLE]
- `TITLE.Operator(s).Phone` (docs=191, unique=159) [scope=TITLE]
- `1.2 Contact Information/Responsable Parties.Operator(s).Phone` (docs=191, unique=155) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Phone` (docs=190, unique=154) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.Project Manager.Phone` (docs=189, unique=153) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Line2` (docs=196, unique=152) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line2` (docs=168, unique=147) [scope=1.2 Contact Information/Responsable Parties]
- `SECTION 8: CERTIFICATION AND NOTIFICATION.Operator(s).SWPPP Contact` (docs=170, unique=145) [scope=SECTION 8: CERTIFICATION AND NOTIFICATION]
- `1.2 Contact Information/Responsable Parties.Operator(s).Line4` (docs=196, unique=139) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line3` (docs=164, unique=138) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.Project Manager.Contact` (docs=156, unique=138) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.Project Manager.Line3` (docs=195, unique=132) [scope=1.2 Contact Information/Responsable Parties]
- `1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Soil type(s)` (docs=196, unique=127) [scope=1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns]
- `1.3 Nature and Sequence of Construction Activity.Estimated Project Start Date` (docs=196, unique=126) [scope=1.3 Nature and Sequence of Construction Activity]
- `1.2 Contact Information/Responsable Parties.Operator(s).Line5` (docs=196, unique=125) [scope=1.2 Contact Information/Responsable Parties]
- `TITLE.SWPPP Contact(s).Project Start Date` (docs=192, unique=125) [scope=TITLE]
- `2.4 Stabilize Soils.BMP EC-7.Responsible Staff` (docs=196, unique=119) [scope=2.4 Stabilize Soils]
- `SECTION 4: SELECTING POST-CONSTRUCTION BMPs.Responsible Staff` (docs=196, unique=119) [scope=SECTION 4: SELECTING POST-CONSTRUCTION BMPs]
- `1.2 Contact Information/Responsable Parties.Operator(s).Line2` (docs=196, unique=118) [scope=1.2 Contact Information/Responsable Parties]
- `TITLE.Operator(s).Line2` (docs=193, unique=117) [scope=TITLE]
- `TITLE.SWPPP Contact(s).Line3` (docs=196, unique=116) [scope=TITLE]
- `1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line1` (docs=188, unique=116) [scope=1.2 Contact Information/Responsable Parties]
- `1.2 Contact Information/Responsable Parties.Operator(s).Line1` (docs=196, unique=112) [scope=1.2 Contact Information/Responsable Parties]

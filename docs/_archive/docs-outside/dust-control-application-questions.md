# Dust Control Application - Data Extraction Template

## Instructions for LLM

You are extracting information from construction documents (plans, permits, specifications) to complete a Dust Control Plan Application.

* *How to use this template:**

1. Read through the provided construction documents
2. For each field below, extract the relevant information if available
3. If information is not found in the documents, mark as `[NOT FOUND IN DOCS]`
4. **Exception for Yes/No questions:**For Yes/No questions at the start of each section (e.g., "Will there be demolition activities?", "Will there be weed abatement?"), if not mentioned in the documents,**default to No**
5. If a Yes/No question is answered "No", skip the sub-fields for that section
6. For fields marked "select one" or "check all that apply", only use the provided options

* *Primary/Contingency Assignment Rules:**

* Each section specifies its minimum requirements (e.g., "Requires at least 1 Primary and 1 Contingency")
* When multiple control measures are mentioned in documents but not labeled as Primary or Contingency, assign them to meet the section's minimum requirements
* Example: If a section requires at least 1 Primary and 1 Contingency, and 3 measures are mentioned, label the first as Primary and at least one other as Contingency
* Example: If a section requires only 1 Contingency and 2 measures are mentioned, label one as Contingency

* *Output format:** Replace the bracketed placeholders with actual values. Keep the field labels intact.

- --

## A. Applicant Information (The legal entity - Developer/General Contractor for the Project)

### A.1 Company Details

* **Relationship to property (check all that apply):** `[Owner / Lessee / Agent / Other]`
* **Type of Entity:** `[select one]`

  * Association
  * Business Trust
  * Corporation
  * General Partnership
  * Government Entity
  * Individual
  * Limited Liability Company
  * Limited Partnership
  * Sole Proprietor

* **Company/Individual Name:** `[value]`
* **Address Line 1:** `[value]`
* **City:** `[value]`
* **State:** `[value]`
* **Zip:** `[value]`
* **Phone:** `[value]`
* **Email:** `[value]`

### A.2 President/Owner

* **First Name:** `[value]`
* **Last Name:** `[value]`
* **Address Line 1:** `[value]`
* **City:** `[value]`
* **State:** `[value]`
* **Zip:** `[value]`
* **Phone:** `[value]`
* **Email:** `[value]`

- --

### A.3 Is the Applicant a wholly owned subsidiary of another Company?

`[Yes/No]`

### A.4 Is the owner different than the applicant?

`[Yes/No]`

### A.5 Property Owner (Complete only if different from Applicant)

* **Type of Entity:** `[select one]`

  * Association
  * Business Trust
  * Corporation
  * General Partnership
  * Government Entity
  * Individual
  * Limited Liability Company
  * Limited Partnership
  * Sole Proprietor

* **Name:** `[value]`
* **Address Line 1:** `[value]`
* **City:** `[value]`
* **State:** `[value]`
* **Zip:** `[value]`
* **Phone:** `[value]`
* **Contact Person First Name:** `[value]`
* **Contact Person Last Name:** `[value]`
* **Contact Person Phone:** `[value]`
* **Contact Person Email:** `[value]`

### A.6 Primary Project Contact

* Provide a primary project contact/authorized on-site representative for this site.*

* **First Name:** `[value]`
* **Last Name:** `[value]`
* **Title:** `[value]`
* **E-Mail Address:** `[value]`
* **Company Name:** `[value]`
* **On-Site Phone:** `[value]`
* **Mobile:** `[value]`
* **Fax:** `[value]`

- --

## B. Project Information

* **Full Project Name:** `[value]`

  * *Format: If part of larger project, use format like "Sun Health La Loma Campus - Resident Gathering Space"*

* **Project Description:** `[value]`

  * *Brief description, e.g.: "3-building commercial complex", "custom home", "weed control", "demolition of two buildings", "roadway improvements"*

* **Start Date:** `[MM/DD/YYYY]`
* **End Date:** `[MM/DD/YYYY]`

### B.1 Estimated Bulk Materials (Rule 310, Section 203)

* Bulk Material includes, but is not limited to, the following: earth, rock, silt, sediment, sand, gravel, soil, fill, aggregate less than 2 inches in length or diameter, dirt, mud, demolition debris, cotton, trash, cinders, pumice, sawdust, feeds, grains, fertilizers, fluff from shredders, and dry concrete. (See Rule 310, Section 203.)*

* **Estimated cubic yards of Bulk Material to be imported and exported in total for the entire project:** `[value]`

### B.2 Asbestos NESHAP Information

* *Definitions:**

* **Demolition:** The wrecking or taking out of any load-supporting structural member of a facility together with any related handling operations or the intentional burning of a facility.
* **Renovation:** Altering a facility or one or more facility components in any way, including the stripping or removal of Regulated Asbestos Containing Material (RACM) from a facility component.

* **Does the project include any demolition or renovation of a current or prior ranch, farm, business, or commercial structure?** `[Yes/No]`

- --

## C. Dust Control Plan Data

### Category A: Wind-Blown Dust

* If wind conditions cause fugitive dust to exceed the 20% opacity requirement, which stabilization method(s) will be used?*

| Method | Selected |
|--------|----------|
| Maintain a soil crust | `[Yes/No]` |
| Maintain threshold friction velocity (TFV) for disturbed surface areas corrected for non-erodible elements of 100 cm/second or higher | `[Yes/No]` |
| Maintain vegetative ground cover | `[Yes/No]` |
| Other | `[Yes/No]` |
|   - IF OTHER: Specify | `[describe]` |

- --

### Category B: Vehicles/Motorized Equipment

#### B.1 Unpaved Staging Areas, Parking Areas, and Material Storage Areas

* **Will Vehicles/Motorized Equipment Be Used on these areas?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Primary and 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Pave | `[Primary / Contingency / None]` |
|   - IF PAVING: | `[Pave prior to project / Pave during project / Pave at end of project]` |
| Apply and maintain gravel, recycled asphalt, or other suitable material | `[Primary / Contingency / None]` |
| Apply water | `[Primary / Contingency / None]` |
| Apply and maintain dust suppressants other than water | `[Primary / Contingency / None]` |
|   - IF DUST SUPPRESSANTS: Frequency of application | `[value]` |
|   - IF DUST SUPPRESSANTS: Amount/Intensity | `[value]` |
| Limit vehicle trips to no more than 20 per day per road and limit vehicle speeds to no more than 15 m.p.h | `[Primary / Contingency / None]` |
|   - IF LIMIT TRIPS/SPEED: Max vehicle trips per day | `[value]` |
|   - IF LIMIT TRIPS/SPEED: How will speeds be restricted to 15 m.p.h.? | `[describe]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (225-400 Gal) / 2-10 Acres (400-2,250 Gal) / 10-100 Acres (2,250-22,500 Gal) / >100 Acres (>22,500 Gal)]` |

#### B.2 Unpaved Access Areas/Haul Roads

* **Will Vehicles/Motorized Equipment Be Used on these areas?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Primary and 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Pave | `[Primary / Contingency / None]` |
|   - IF PAVING: | `[Pave prior to project / Pave during project / Pave at end of project]` |
| Apply and maintain gravel, recycled asphalt, or other suitable material | `[Primary / Contingency / None]` |
| Apply water | `[Primary / Contingency / None]` |
| Apply and maintain dust suppressants other than water | `[Primary / Contingency / None]` |
|   - IF DUST SUPPRESSANTS: Frequency of application | `[value]` |
|   - IF DUST SUPPRESSANTS: Amount/Intensity | `[value]` |
| Limit vehicle trips to no more than 20 per day per road and limit vehicle speeds to no more than 15 m.p.h | `[Primary / Contingency / None]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |
| Cease operations *(contingency only)* | `[Contingency / None]` |
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (225-400 Gal) / 2-10 Acres (400-2,250 Gal) / 10-100 Acres (2,250-22,500 Gal) / >100 Acres (>22,500 Gal)]` |

- --

### Category C: Surface Stabilization

#### C.1 Before Active Operations Occur

* Requires at least 1 Primary and 1 Contingency:*

| Control Measure | Selection |
|-----------------|-----------|
| Pre-water site to depth of cuts, allowing time for water to penetrate | `[Primary / Contingency / None]` |
| Phase work to reduce amount of disturbed surface at any one time | `[Primary / Contingency / None]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |

#### C.2 During Active Operations

* Requires at least 1 Primary and 1 Contingency:*

| Control Measure | Selection |
|-----------------|-----------|
| Apply water to keep soil visibly moist | `[Primary / Contingency / None]` |
| Apply water to maintain soil moisture (per ASTM Method D2216-05) | `[Primary / Contingency / None]` |
| Apply and maintain dust suppressants other than water | `[Primary / Contingency / None]` |
|   - IF DUST SUPPRESSANTS: Frequency of application | `[value]` |
|   - IF DUST SUPPRESSANTS: Amount/Intensity | `[value]` |
| In conjunction with other measures, construct fences or wind barriers | `[Primary / Contingency / None]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (225-400 Gal) / 2-10 Acres (400-2,250 Gal) / 10-100 Acres (2,250-22,500 Gal) / >100 Acres (>22,500 Gal)]` |

#### C.3 During Any Inactive Period (Weekends, After Hours, Holidays)

* Requires at least 1 Primary and 1 Contingency:*

| Control Measure | Selection |
|-----------------|-----------|
| Apply water | `[Primary / Contingency / None]` |
| Apply and maintain surface gravel | `[Primary / Contingency / None]` |
| Apply and maintain dust suppressants other than water | `[Primary / Contingency / None]` |
|   - IF DUST SUPPRESSANTS: Frequency of application | `[value]` |
|   - IF DUST SUPPRESSANTS: Amount/Intensity | `[value]` |
| Cover storage piles with tarps, plastic, etc. such that wind will not remove covering(s) | `[Primary / Contingency / None]` |
| Establish vegetative ground cover (landscaping) | `[Primary / Contingency / None]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (225-400 Gal) / 2-10 Acres (400-2,250 Gal) / 10-100 Acres (2,250-22,500 Gal) / >100 Acres (>22,500 Gal)]` |

#### C.4 Permanent Stabilization of Disturbed Surface Areas

* Requires at least 1 Primary and 1 Contingency:*

| Control Measure | Selection |
|-----------------|-----------|
| Pave | `[Primary / Contingency / None]` |
|   - IF PAVING: | `[Pave prior to project / Pave during project / Pave at end of project]` |
| Apply and maintain gravel, recycled asphalt, or other suitable material | `[Primary / Contingency / None]` |
| Apply and maintain dust suppressants other than water | `[Primary / Contingency / None]` |
|   - IF DUST SUPPRESSANTS: Frequency of application | `[value]` |
|   - IF DUST SUPPRESSANTS: Amount/Intensity | `[value]` |
| Establish vegetative ground cover (landscaping) | `[Primary / Contingency / None]` |
| In addition to other control measures, restrict vehicle access to the area | `[Primary / Contingency / None]` |
| Apply water (sufficient to maintain a visible soil crust) & prevent access/trespass | `[Primary / Contingency / None]` |
| Prevent access/trespass | `[Primary / Contingency / None]` |
|   - IF PREVENT ACCESS: Methods, check all that apply | `[Ditches / Fences / Berms / Shrubs / Trees / Other]` |
|   - IF PREVENT ACCESS OTHER: Specify | `[describe]` |
| Restore vegetation & soil similar to undisturbed native conditions (desert xeriscaping) | `[Primary / Contingency / None]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |

- --

### Category D: Bulk Material Handling

#### D.1 Materials Hauled onto Public Areas

* **Will Materials be Hauled from the Site onto or crossing Areas Accessible to the Public?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Apply water to the top of the load | `[Contingency / None]` |
| Apply dust suppressants other than water to top of load | `[Contingency / None]` |
| Cease operations | `[Contingency / None]` |
| Other | `[Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |

#### D.2 Materials Hauled within Work Site (No Public Access)

* **Will Materials be Hauled or Transported within the Boundaries of the Work Site?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Primary and 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Limit vehicle speed to 15 m.p.h. or less while traveling on the work site | `[Primary / Contingency / None]` |
| Apply water to the top of the load | `[Primary / Contingency / None]` |
| Apply dust suppressants other than water to top of load | `[Primary / Contingency / None]` |
| Cover haul trucks with a tarp or other suitable enclosure | `[Primary / Contingency / None]` |
| Cease operations *(contingency only)* | `[Contingency / None]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |

#### D.3 Materials Hauled within Site AND Crossing Public Areas

* **Will materials cross or access an Area Accessible to the Public?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Cease operations | `[Contingency / None]` |
| Other | `[Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |

#### D.4 Loading, Unloading, and Stacking

* **Will Bulk Materials be Loaded, Unloaded, and/or Stacked?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Primary and 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Cease operations *(contingency only)* | `[Contingency / None]` |
| Apply water | `[Primary / Contingency / None]` |
| Apply and maintain dust suppressants other than water | `[Primary / Contingency / None]` |
|   - IF DUST SUPPRESSANTS: Frequency of application | `[value]` |
|   - IF DUST SUPPRESSANTS: Amount/Intensity | `[value]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |
| Number of Yards to be Imported/Exported | `[value]` |
| Number of Days of Importing/Exporting Operations | `[value]` |

#### D.5 Open Storage Piles

* **Will there be Open Storage Piles for Any Amount of Time?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Primary and 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Cover open storage piles with tarps, plastic, or other material | `[Primary / Contingency / None]` |
| Apply water to maintain soil moisture (per ASTM Method D2216-05) | `[Primary / Contingency / None]` |
| Maintain a visible soil crust | `[Primary / Contingency / None]` |
| Construct wind barriers, silos, or enclosures | `[Primary / Contingency / None]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |

- --

### Category E: Trackout, Carry-out, Spillage

#### E.1 Trackout Control Device

* **Does site have 2+ acres or 100+ cubic yards hauled daily?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Device Type (check all that apply) | `[Gravel pad / Grizzly or rumble grate / Wheel wash system / Paved area / Other (Primary in addition to above)]` |
|   - IF DEVICE TYPE OTHER: Specify | `[describe]` |
| Cease operations | `[Contingency / None]` |
| Other | `[Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |

#### E.2 Cleaning

* Requires at least 1 Primary and 1 Contingency:*

| Control Measure | Selection |
|-----------------|-----------|
| Operate a street sweeper or wet broom with sufficient water | `[Primary / Contingency / None]` |
| Manually sweep up deposits | `[Primary / Contingency / None]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |

- --

### Category F: Grading

#### F.1 Mass Grading

* **Will there be any mass grading on this site?** `[Yes/No]`

* If Yes, complete the following:*

| Field | Value |
|-------|-------|
| Average Daily Disturbance (Acres) - November through February | `[value]` |
| Average Daily Disturbance (Acres) - March through October | `[value]` |

#### F.2 Fine Grading

* **Will there be any fine grading on this site?** `[Yes/No]`

* If Yes, complete the following:*

| Field | Value |
|-------|-------|
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (300-600 Gal) / 2-10 Acres (600-3,000 Gal) / 10-100 Acres (3,000-30,000 Gal) / >100 Acres (>30,000 Gal)]` |

- --

### Category G: Utilities and Vertical Construction

#### G.1 Underground Utilities & Structure Excavation

* **Will there be underground utilities or structure excavation?** `[Yes/No]`

* If Yes, complete the following:*

| Field | Value |
|-------|-------|
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (300-600 Gal) / 2-10 Acres (600-3,000 Gal) / 10-100 Acres (3,000-30,000 Gal) / >100 Acres (>30,000 Gal)]` |

#### G.2 Construction of Vertical Structures

* **Will there be any vertical structures built on this site?** `[Yes/No]`

* If Yes, complete the following:*

| Field | Value |
|-------|-------|
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (150-300 Gal) / 2-10 Acres (300-1,500 Gal) / 10-100 Acres (1,500-15,000 Gal) / >100 Acres (>15,000 Gal)]` |

- --

### Category H: Demolition Activities

* **Will there be any demolition activities on this site?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Are dust suppressants other than water used? | `[Yes/No]` |
|   - IF DUST SUPPRESSANTS: Frequency of application | `[value]` |
|   - IF DUST SUPPRESSANTS: Amount/Intensity | `[value]` |
| Thoroughly clean debris from paved & other surfaces following demolition | `[Contingency / None]` |
| Other | `[Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (225-400 Gal) / 2-10 Acres (400-2,250 Gal) / 10-100 Acres (2,250-22,500 Gal) / >100 Acres (>22,500 Gal)]` |

- --

### Category I: Weed Abatement

#### I.1 Disturbance Operations before and during Weed Abatement

* **Will there be any weed abatement by discing or blading?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Cease operations *(contingency only)* | `[Contingency / None]` |
| Other | `[Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (300-600 Gal) / 2-10 Acres (600-3,000 Gal) / 10-100 Acres (3,000-30,000 Gal) / >100 Acres (>30,000 Gal)]` |

#### I.2 Stabilization following Weed Abatement

* Requires at least 1 Primary and 1 Contingency:*

| Control Measure | Selection |
|-----------------|-----------|
| Pave immediately following weed abatement | `[Primary / Contingency / None]` |
| Apply gravel | `[Primary / Contingency / None]` |
| Apply water | `[Primary / Contingency / None]` |
| Apply and maintain dust suppressants other than water | `[Primary / Contingency / None]` |
| Establish vegetative ground cover (landscaping) | `[Primary / Contingency / None]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |

- --

### Category J: Blasting Operations

* **Will there be any blasting on this site?** `[Yes/No]`

* If Yes, complete the following (requires at least 1 Primary and 1 Contingency):*

| Control Measure | Selection |
|-----------------|-----------|
| Apply water | `[Primary / Contingency / None]` |
| Apply and maintain dust suppressants other than water | `[Primary / Contingency / None]` |
|   - IF DUST SUPPRESSANTS: Frequency of application | `[value]` |
|   - IF DUST SUPPRESSANTS: Amount/Intensity | `[value]` |
| Other | `[Primary / Contingency / None]` |
|   - IF OTHER: Specify | `[describe]` |
| Average Daily Disturbed Area (Acres) | `[value]` |
| Required Minimum Water Available | `[0-2 Acres (225-400 Gal) / 2-10 Acres (400-2,250 Gal) / 10-100 Acres (2,250-22,500 Gal) / >100 Acres (>22,500 Gal)]` |

- --

### Category K: Technical Data

#### K.1 Soil Texture

| Soil Type | Texture |
|-----------|---------|
| Soil naturally present on work site | `[Severe - Clay / Moderate - Other]` |
| Soil to be imported to work site | `[Severe - Clay / Moderate - Other / None]` |

#### K.2 Water Source(s)

| Source Type | In Use? | Quantity | Size/Capacity |
|-------------|---------|----------|---------------|
| Metered Hydrant | `[Yes/No]` | `[value]` | `[value]` |
| Water Tower | `[Yes/No]` | `[value]` | `[value]` |
| Water Pond | `[Yes/No]` | `[value]` | `[value]` |
| Off-Site | `[Yes/No]` | `[value]` | `[value]` |
| Hose Bib | `[Yes/No]` | `[value]` | `[value]` |
| Other | `[Yes/No]` | `[value]` | `[value]` |

#### K.3 Water Application Method(s)

| Method | In Use? | Quantity | Size/Capacity |
|--------|---------|----------|---------------|
| Hose | `[Yes/No]` | `[value]` | `[value]` |
| Water Truck | `[Yes/No]` | `[value]` | `[value]` |
| Water Pull | `[Yes/No]` | `[value]` | `[value]` |
| Water Buffalo | `[Yes/No]` | `[value]` | `[value]` |
| Other | `[Yes/No]` | `[value]` | `[value]` |

- --

## Notes for LLM

* *Common places to find this information in construction documents:**

* **Applicant/Owner info**: Title sheet, cover page, permit application pages
* **Project name/description**: Title sheet, project summary
* **Dates**: Construction schedule, phasing plans, permit docs
* **Site acreage**: Civil drawings, site plan, grading plan
* **Grading/excavation details**: Grading plans (C-series sheets), earthwork specs
* **Demolition**: Demo plans, scope of work
* **Utilities**: Utility plans, MEP drawings
* **Vertical structures**: Architectural plans, structural drawings
* **Paving/landscaping**: Landscape plans (L-series), hardscape plans
* **Water sources**: Civil drawings, utility connections

* *Default behavior:**

* For data fields (names, addresses, dates, etc.): If not found, mark as `[NOT FOUND IN DOCS]`
* For Yes/No activity questions (e.g., "Will there be demolition?", "Will there be blasting?"): If not mentioned in docs, **default to No**

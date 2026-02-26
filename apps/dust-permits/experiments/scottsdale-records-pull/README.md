# Scottsdale Public Records Pull (No-Click Endpoint Workflow)

Date: 2026-02-26

This experiment documents the exact endpoint workflow used to pull Scottsdale planning/building files directly (without browser clicking).

## Folder Layout

- `scottsdale-probe-2026-02-26/results/`: raw endpoint responses, payloads, extracted link lists, manifests.
- `scottsdale-probe-2026-02-26/details/`: fetched detail pages (building, plan, case, ROW).
- `scottsdale-probe-2026-02-26/downloads/`: downloaded files.
- `scottsdale-probe-2026-02-26/source-pages/`: initial HTML snapshots for top-level Scottsdale pages.

Key manifests:

- `scottsdale-probe-2026-02-26/results/dm-all-download-manifest.tsv`
- `scottsdale-probe-2026-02-26/results/case-submittal-manifest.tsv`
- `scottsdale-probe-2026-02-26/results/row-viewer-manifest.tsv`

## What Worked

1. `EDM/LoadMoreDocuments` + `EDM/Viewer` (primary file source)
2. `PropertyRequest/LoadMoreBuildingPermits` -> `BuildingPermit/Details/{id}` -> `EDM/Viewer`
3. `Cases/LoadMoreCases` -> `Cases/Details/{id}` -> direct `applicant_submittals/*.pdf` links (when present)
4. `ROWPermit/LoadMoreROWPermits` -> `ROWPermit/Details/{id}` -> `EDM/Viewer` (when present)
5. `BuildingPermit/DownloadCSVReport` (CSV export)

## Endpoint Reference

Base: `https://eservices.scottsdaleaz.gov/bldgresources`

- `POST /EDM/LoadMoreDocuments` (JSON)
- `GET /EDM/Viewer?docId=...&docName=...&fileExt=pdf`
- `POST /PropertyRequest/LoadMoreBuildingPermits` (JSON)
- `GET /BuildingPermit/Details/{id}`
- `POST /Cases/LoadMoreCases` (JSON)
- `GET /Cases/Details/{id}`
- `POST /ROWPermit/LoadMoreROWPermits` (JSON)
- `GET /ROWPermit/Details/{id}`
- `POST /BuildingPermit/DownloadCSVReport` (form-urlencoded)

## Re-run Steps

Run from repo root.

### 1) Warm session + pull document pages

```bash
BASE='https://eservices.scottsdaleaz.gov/bldgresources'
JAR='cookies.txt'
UA='Mozilla/5.0'

curl -sS -A "$UA" -c "$JAR" -b "$JAR" "$BASE/EDM/DMSearch" -o /dev/null

for p in $(seq 0 20); do
  cat > payload.json <<JSON
{"PageNumber":$p,"StreetNum":"17600","StreetDir":"N","StreetName":"PERIMETER","StreetType":"DR","SuffixType":"","SuffixNum":"","LotNum":"","CaseNum":"","PlanNum":"","PermitNum":"","CivilNum":"","APNNum":"","FullText":"","DocType":"","SortProperty":"","SortOrder":""}
JSON

  curl -sS -A "$UA" -b "$JAR" -c "$JAR" \
    -H 'Content-Type: application/json; charset=utf-8' \
    -H 'X-Requested-With: XMLHttpRequest' \
    -H 'Origin: https://eservices.scottsdaleaz.gov' \
    -H 'Referer: https://eservices.scottsdaleaz.gov/bldgresources/EDM/DMSearch' \
    --data @payload.json \
    "$BASE/EDM/LoadMoreDocuments" -o "page-$p.html"

done
```

Notes:
- `StreetType` is short code format (`DR`, `AV`, etc). Passing full words can trigger invalid request errors.
- Parse `data-href=/bldgresources/EDM/Viewer?...` out of each page and download each viewer URL.

### 2) Building permits via PropertyRequest

```bash
curl -sS -A "$UA" -b "$JAR" -c "$JAR" "$BASE/PropertyRequest" -o /dev/null

cat > payload-building.json <<JSON
{"PageNumber":0,"PermitNumber":"","StreetNumber":"17600","StreetName":"PERIMETER","Subdivision":"","LotNumber":"","OwnerName":"","APN":"","UnitNumber":""}
JSON

curl -sS -A "$UA" -b "$JAR" -c "$JAR" \
  -H 'Content-Type: application/json; charset=utf-8' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Origin: https://eservices.scottsdaleaz.gov' \
  -H 'Referer: https://eservices.scottsdaleaz.gov/bldgresources/PropertyRequest' \
  --data @payload-building.json \
  "$BASE/PropertyRequest/LoadMoreBuildingPermits"
```

Then fetch each `BuildingPermit/Details/{id}` and extract any `EDM/Viewer` links.

### 3) Cases

```bash
curl -sS -A "$UA" -b "$JAR" -c "$JAR" "$BASE/Cases" -o /dev/null

cat > payload-cases.json <<JSON
{"PageNumber":0,"CaseNumber":"16-DR-2025","CaseType":"","CaseName":"","Location":"","CaseYear":"","SortProperty":"","SortOrder":""}
JSON

curl -sS -A "$UA" -b "$JAR" -c "$JAR" \
  -H 'Content-Type: application/json; charset=utf-8' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Origin: https://eservices.scottsdaleaz.gov' \
  -H 'Referer: https://eservices.scottsdaleaz.gov/bldgresources/Cases' \
  --data @payload-cases.json \
  "$BASE/Cases/LoadMoreCases"
```

Then fetch each `Cases/Details/{id}` and download any `https://eservices.scottsdaleaz.gov/planning/projectsummary/applicant_submittals/*.pdf` links.

### 4) ROW permits

```bash
curl -sS -A "$UA" -b "$JAR" -c "$JAR" "$BASE/ROWPermit" -o /dev/null

cat > payload-row.json <<JSON
{"PageNumber":0,"PermitNumber":"","ProjectName":"","Location":"PERIMETER","OwnerName":"","APN":"","WorkOrder":"","SortProperty":"","SortOrder":""}
JSON

curl -sS -A "$UA" -b "$JAR" -c "$JAR" \
  -H 'Content-Type: application/json; charset=utf-8' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Origin: https://eservices.scottsdaleaz.gov' \
  -H 'Referer: https://eservices.scottsdaleaz.gov/bldgresources/ROWPermit' \
  --data @payload-row.json \
  "$BASE/ROWPermit/LoadMoreROWPermits"
```

Then fetch `ROWPermit/Details/{id}` pages and download any `EDM/Viewer` links.

### 5) Building permit CSV report

```bash
curl -sS -A "$UA" -b "$JAR" -c "$JAR" "$BASE/BuildingPermit/Reports" -o /dev/null

curl -sS -A "$UA" -b "$JAR" -c "$JAR" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Origin: https://eservices.scottsdaleaz.gov' \
  -H 'Referer: https://eservices.scottsdaleaz.gov/bldgresources/BuildingPermit/Reports' \
  --data 'permitTypeID=0&startDate=2026-02-01&endDate=2026-02-25' \
  "$BASE/BuildingPermit/DownloadCSVReport" -o building-permit-report.csv
```

## Run Output Summary (This Capture)

- `DMSearch (EDM)`: 97 files (`~123 MB`)
- `Case submittals`: 2 files (`~44 MB`)
- `ROW detail docs`: 1 file
- `Building permit report`: 1 CSV

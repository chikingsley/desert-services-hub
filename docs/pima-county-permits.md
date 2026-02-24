# Pima County Dust Permits & GIS

Pima County has its own fugitive dust permit program run by PDEQ (Pima County Dept of Environmental Quality), completely separate from Maricopa County's `dm.maricopa.gov` portal.

## Fugitive Dust Permit

### When Required

- Greater than 1 acre of surface stripped
- Greater than 300 feet of trench cut
- Any blasting

### Application

| | |
|---|---|
| **Online Portal** | <https://aca-prod.accela.com/PIMA/Default.aspx> (Accela platform) |
| **Info Page** | <https://www.pima.gov/596/Fugitive-Dust> |
| **Permits & Forms** | <https://www.pima.gov/530/Permits-Forms> |
| **Air Quality Permits** | <https://www.pima.gov/439/Air-Quality-Permits> |
| **Phone** | PDEQ: 520-724-7400 |
| **Payment** | Visa/Mastercard online, or cash/check in person |
| **Permit Duration** | 1 year from issuance |
| **Fee Code** | [Pima County Code 17.14.050](https://codelibrary.amlegal.com/codes/pimacounty/latest/pimacounty_az/0-0-0-13282) |

### Process

1. Go to the [Accela Portal](https://aca-prod.accela.com/PIMA/Default.aspx)
2. Create an account or log in
3. Complete the Fugitive Dust Activity Permit application
4. Pay with Visa/Mastercard
5. Print/save permit and receipt — PDEQ will also email the permit

### Key Differences from Maricopa

- Uses **Accela** (generic municipal permitting platform) vs Maricopa's custom portal
- No shared login or data between counties
- No automation currently exists — manual filing only
- Permit record search: <http://www.deq.pima.gov/Records/>

---

## Parcel Lookup — Pima County GIS

### Web Tools

| Tool | URL | Use |
|------|-----|-----|
| **Assessor Parcel Search** | <https://gis.pima.gov/maps/landbase/parsrch.htm> | Search by address, parcel code, or taxpayer name |
| **Assessor Advanced Search** | <https://www.asr.pima.gov/advanced-search> | More search options |
| **PimaMaps** | <https://gis.pima.gov/> | Interactive map — click parcel for details |
| **Geospatial Data Portal** | <https://gisopendata.pima.gov/> | Open data downloads |

### ArcGIS REST API (No Auth Required)

Base URL: `https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer`

#### Key Layers

| Layer ID | Name | Use |
|----------|------|-----|
| 0 | Parcel Centroids | Point data with parcel center coordinates |
| 12 | Parcels - Regional | Full parcel polygons — **primary query layer** |
| 13 | Parcels - Regional (Tax Code Only) | Simplified, tax code only |
| 15 | Subdivisions | Subdivision boundaries |

#### Queryable Fields (Layer 12)

| Field | Description |
|-------|-------------|
| `PARCEL` | Tax code (e.g., `103214010`) |
| `ADDRESS_OL` | Street address |
| `JURIS_OL` | Jurisdiction (Tucson, Unincorporated Pima, etc.) |
| `GISACRES` | Parcel size in acres |
| `PARCEL_USE` | Use classification code |
| `CURZONE_OL` | Zoning |
| `LON` / `LAT` | Centroid coordinates |
| `MAIL1`–`MAIL5` | Mailing address lines |
| `LEGAL1`–`LEGAL5` | Legal description |
| `FCV` | Full Cash Value |
| `TAXYR` | Tax year |

#### Example Queries

**Search by address:**
```text
GET /12/query?where=ADDRESS_OL LIKE '%ELLSWORTH%'&outFields=PARCEL,ADDRESS_OL,GISACRES,JURIS_OL&f=json
```

**Search by parcel code:**
```text
GET /12/query?where=PARCEL='103214010'&outFields=*&f=json
```

**Search by mailing name (owner proxy):**
```text
GET /12/query?where=MAIL1 LIKE '%UNITED STATES%'&outFields=PARCEL,ADDRESS_OL,GISACRES,MAIL1&f=json
```

**Large government parcels in Tucson:**
```text
GET /12/query?where=GISACRES > 100 AND JURIS_OL='Tucson'&outFields=PARCEL,ADDRESS_OL,GISACRES,MAIL1&f=json
```

All queries support `resultRecordCount` (max 2000) and return JSON or GeoJSON (`f=geojson`).

#### Notes

- **No auth required** — fully open REST API
- Max 2000 records per query
- Federal land (e.g., Davis-Monthan AFB) may not appear in standard parcel records — assessor may list as government-exempt
- Owner name is NOT a direct field — use `MAIL1` as a proxy (mailing address line 1 often contains owner name)

# ArcGIS Permit/Map Sync Readiness (2026-02-21)

This is a readiness check for pulling AZDEQ map layers at scale from ArcGIS REST.

Data was fetched live into:

- `packages/azdeq-cgp-sync/research/arcgis/service-directory.json`
- `packages/azdeq-cgp-sync/research/arcgis/permit-related-services-summary.json`
- `packages/azdeq-cgp-sync/research/arcgis/service-layer-summary.json`

## Key Permit-Related Services and Counts

- `AZPDES/FeatureServer`
  - `AZPDES Construction`: `10,429`
  - `AZPDES De Minimus`: `319`
  - `AZPDES Multi-Sector`: `1,503`
  - `AZPDES myDEQ CGP`: `27,506`
  - `AZPDES myDEQ DMGP`: `481`
  - `AZPDES myDEQ MSGP`: `4,015`
- `AZPDES_Individual_Permits/FeatureServer`
  - `AZPDES Individual Permits`: `129`
- `Dust_Visibility_Construction_Notification_Area/FeatureServer`
  - `Dust Visibility Construction Notification Area`: `407`

## Geometry and Pagination Readiness

- `AZPDES` and `AZPDES_Individual_Permits` are `esriGeometryPoint`.
- `Dust_Visibility_Construction_Notification_Area` is `esriGeometryPolygon`.
- Observed `maxRecordCount` is typically `2000`.
- Observed `supportsPagination` is `true`.
- This means full extraction is straightforward with `resultOffset` + `resultRecordCount` paging and stable ordering.

## Practical Full-Sync Query Pattern

1. Fetch layer metadata (`/FeatureServer/<layerId>?f=pjson`) and note:
   - `objectIdField`
   - `maxRecordCount`
   - `advancedQueryCapabilities.supportsPagination`
2. Pull total count with `returnCountOnly=true`.
3. Page through records:
   - `where=1=1`
   - `outFields=*`
   - `orderByFields=<objectIdField> ASC`
   - `resultOffset=<n>`
   - `resultRecordCount=<batchSize>`
4. Continue until page returns `0` rows.
5. Upsert rows by stable ArcGIS identifiers (`OBJECTID`, `GLOBALID`, or domain key fields).

## Incremental Sync Pattern

- Prefer change windows when available via timestamp fields (`LAST_UPDATE`, `EDIT_DATE`, etc.).
- Query with time/status predicates where field availability allows.
- Still schedule periodic full reconciliation runs to catch late corrections and deletes.

## PDFs / Permit Documents

- `AZPDES_Individual_Permits` rows include direct document URL fields:
  - `PERMIT`
  - `FACTSHEET`
- Example values point at `https://static.azdeq.gov/gis/azpdes_pdfs/...`.
- The CGP endpoint (`my.azdeq.gov/deq-search/service/permit/cgp`) returns rich NOI metadata, but no direct PDF URL fields were observed in sampled records.

## Bottom Line

- Map-side sync is operationally straightforward and production-ready from a data-access perspective.
- Main implementation work remaining is packaging it into the same run model already used in `azdeq-cgp-sync` (run table, idempotent upsert, cron job wiring).

## Primary Sources

- ArcGIS query map layer and transfer-limit behavior: <https://developers.arcgis.com/rest/services-reference/enterprise/query-map-service-layer/>
- ArcGIS query feature layer pagination/order guidance: <https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/>
- ArcGIS service directory used for live layer discovery: <https://services.arcgis.com/SzoH1oFM2apCSkx3/ArcGIS/rest/services>

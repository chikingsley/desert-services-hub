# Rainfall Monitoring System for SWPPP Inspections

Automated system to detect when sites hit the 0.5" rainfall threshold (24hr) and trigger inspection requirements.

## Data Sources

### Primary: Physical Rain Gauges

| Source | Coverage | Stations | Format | URL |
|--------|----------|----------|--------|-----|
| **Maricopa FCD** | Phoenix metro, Maricopa County | 545 | Text files | `https://alert.fcd.maricopa.gov/alert/Rain/ev_rain.txt` |
| | | 342 | Text files | `https://alert.fcd.maricopa.gov/alert/Rain/prpt.txt` |
| **Pima RFCD** | Tucson, Green Valley, Marana | 113+ | HTML table | `https://alertmap.rfcd.pima.gov/gmap/gmap_files/php/Tables/pgi.php` |

Local copies in this folder:
- `ev_rain.txt` - Maricopa 6hr/24hr with location metadata
- `prpt.txt` - Maricopa 15min/1hr/3hr/6hr/24hr/72hr by gage ID
- `pima_precip.html` - Pima County HTML table

### Fallback: Open-Meteo API (Model-Based)

For sites outside gauge coverage (Flagstaff, Camp Verde, Sedona, etc.)

```text
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lon}
  &daily=precipitation_sum
  &past_days=1
  &precipitation_unit=inch
  &timezone=America/Phoenix
```

- No API key needed
- Any lat/lon worldwide
- Returns daily precipitation sum in inches
- ~0.80-0.95 correlation with physical gauges
- May underestimate extreme events by ~35%

## Architecture

```sql
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                            │
│                    (runs every 15 min)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Maricopa FCD   │  │   Pima RFCD     │  │   Open-Meteo    │
│  (text files)   │  │  (HTML scrape)  │  │   (REST API)    │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │  Site Matching  │
                    │  (nearest gauge │
                    │   or lat/lon)   │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Threshold Check│
                    │  (>= 0.5" 24hr) │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     Notion      │
                    │  (update record │
                    │   or create     │
                    │   inspection)   │
                    └─────────────────┘
```

## Site Coverage

Based on `Rw.Location.Upload - Main Master.xlsx`:
- **209 total inspection sites**
- **180 sites (86%)** covered by Maricopa FCD gauges
- **~10-15 sites** covered by Pima RFCD (Tucson, Marana)
- **~15-20 sites** need Open-Meteo fallback (Camp Verde, Flagstaff, Sedona, etc.)

## Tech Stack

- **Runtime**: Bun on Cloudflare Workers
- **Scheduling**: Cron trigger every 15 minutes
- **Data parsing**:
  - Maricopa: Simple text parsing (fixed-width columns)
  - Pima: HTML table scraping (could use Jina or cheerio)
  - Open-Meteo: JSON response
- **Output**: Notion API (update inspection database)
- **No LLM needed** - pure data extraction and threshold comparison

## Data Schema

### Parsed Gauge Reading

```typescript
interface GaugeReading {
  source: 'maricopa' | 'pima' | 'open-meteo';
  gageId?: string;
  gageName?: string;
  city?: string;
  lat?: number;
  lon?: number;
  precipitation24hr: number; // inches
  timestamp: Date;
}
```

### Site Match

```typescript
interface SiteRainfallCheck {
  siteId: string;
  siteName: string;
  city: string;
  lat: number;
  lon: number;
  nearestGage?: string;
  distanceToGage?: number; // miles
  precipitation24hr: number;
  triggersInspection: boolean; // >= 0.5"
  dataSource: 'maricopa' | 'pima' | 'open-meteo';
}
```

## Implementation Notes

1. **Geocode sites once** - convert addresses to lat/lon, store in DB/Notion
2. **Pre-compute nearest gauge** - for each site, find closest Maricopa/Pima gauge
3. **Fallback logic**:
   - If nearest gauge < 10 miles: use gauge
   - If no gauge nearby: use Open-Meteo with site's lat/lon
4. **Alert threshold**: 0.5" (or use 0.4" with Open-Meteo to account for underestimation)
5. **Deduplication**: Don't alert twice for same rain event

## Polling Frequency

- FCD files update every ~5 minutes
- 15-minute poll is reasonable balance
- Could go to 5 min if needed (data is tiny, free)

## Cost

- **Maricopa FCD**: Free, public data
- **Pima RFCD**: Free, public data
- **Open-Meteo**: Free tier (10,000 requests/day)
- **Cloudflare Worker**: Free tier covers this easily
- **Jina** (if used for scraping): We have 1B tokens, this would use minimal

## Next Steps

1. [ ] Geocode all 209 sites from Excel (address -> lat/lon)
2. [ ] Build gauge location index (gage ID -> lat/lon) from Maricopa data
3. [ ] Match each site to nearest gauge or flag for Open-Meteo
4. [ ] Build parser for each data source
5. [ ] Set up Cloudflare Worker with cron
6. [ ] Wire up Notion integration for alerts
7. [ ] Test during next rain event

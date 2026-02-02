# Desert Services SWPPP Inspection Management System

## Executive Summary

A comprehensive construction site inspection management platform that automates rain-triggered inspection alerts, digitizes inspection workflows, and maintains ADEQ compliance records. The system monitors real-time rainfall data from county flood control gauges and triggers inspection requirements based on regulatory thresholds.

---

## The Problem

**Regulatory Burden**: Arizona ADEQ requires SWPPP inspections within 24 hours of any storm event ≥0.5" in 24 hours. Missing an inspection can result in:

- Fines up to $25,000/day per violation
- Stop-work orders
- Permit revocation

**Current Pain Points**:

1. Manual rainfall monitoring across 200+ sites
2. No centralized view of which sites need inspections
3. Paper-based inspection reports are hard to track
4. No automated notification system for rain events
5. Difficulty proving compliance during audits

---

## Market Research: Existing Solutions

| Platform | Pricing | Key Features | Limitations |
|----------|---------|--------------|-------------|
| **ComplianceGo** | $5/site/mo for rain alerts | 1.47M+ inspections, 48 states, mobile app | Expensive at scale, generic |
| **EnviroReport** | Free (5 sites), $15/site/mo | Automated CGP scheduling, PDF reports | Limited rain gauge accuracy |
| **Comply26** | Contact for pricing | NPDES compliance, weather integration | No Arizona-specific integrations |

**Our Advantage**: Direct integration with Maricopa FCD and Pima RFCD physical rain gauges (658+ stations) - far more accurate than model-based estimates used by competitors.

---

## ADEQ SWPPP Inspection Requirements (2025 CGP AZG2025-001)

### Inspection Schedule Options

Sites must choose ONE of these schedules:

| Schedule | Regular Inspection | Rain-Triggered Inspection |
|----------|-------------------|--------------------------|
| **Option A** | Every 7 days | None required |
| **Option B** | Every 14 days | Within 24 hours of ≥0.5" in 24hr |
| **Option C** | Monthly | Within 24 hours of ≥0.25" in 24hr |

Most construction sites use **Option B** for the balance of reduced routine inspections while maintaining compliance.

### Required Inspection Items

- [ ] Perimeter controls (silt fence, fiber rolls)
- [ ] Sediment basins and traps
- [ ] Inlet protection
- [ ] Stabilized construction entrances
- [ ] Concrete washout areas
- [ ] Material storage areas
- [ ] Erosion on exposed slopes
- [ ] Vegetation establishment in stabilized areas

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Desert Services SWPPP Platform                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Weather   │    │    Site     │    │ Inspection  │    │  Reporting  │  │
│  │   Monitor   │───▶│   Matcher   │───▶│   Trigger   │───▶│   Engine    │  │
│  │   Worker    │    │             │    │             │    │             │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │                  │         │
│         ▼                  ▼                  ▼                  ▼         │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                         SQLite Database                              │  │
│  │  • Sites (from Rw.Location.Upload)                                  │  │
│  │  • Rain readings (Maricopa FCD, Pima RFCD, Open-Meteo)             │  │
│  │  • Inspections (forms, photos, status)                              │  │
│  │  • Alerts (sent notifications)                                       │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │         External Services           │
                    ├─────────────────────────────────────┤
                    │  • Microsoft 365 (email alerts)     │
                    │  • Notion (inspection database)     │
                    │  • SMS/Push notifications           │
                    └─────────────────────────────────────┘
```

### Data Sources

#### Primary: Physical Rain Gauges

| Source | Coverage | Stations | Update Freq | URL |
|--------|----------|----------|-------------|-----|
| **Maricopa FCD** | Phoenix metro | 545+ | ~5 min | `alert.fcd.maricopa.gov` |
| **Pima RFCD** | Tucson, Marana | 113+ | ~5 min | `alertmap.rfcd.pima.gov` |

Local sample files in this folder:

- `ev_rain.txt` - Maricopa 6hr/24hr with location metadata
- `prpt.txt` - Maricopa multi-interval by gage ID  
- `pima_precip.html` - Pima County HTML table

#### Fallback: Open-Meteo API

For sites outside gauge coverage (Flagstaff, Camp Verde, Sedona):

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &daily=precipitation_sum
  &past_days=1
  &precipitation_unit=inch
  &timezone=America/Phoenix
```

- No API key needed
- ~0.80-0.95 correlation with physical gauges
- May underestimate extreme events by ~35%
- Use 0.4" threshold to compensate for underestimation

### Site Coverage Analysis

Based on `Rw.Location.Upload - Main Master.xlsx`:

- **209 total inspection sites**
- **180 sites (86%)** covered by Maricopa FCD gauges
- **~10-15 sites** covered by Pima RFCD (Tucson, Marana)
- **~15-20 sites** need Open-Meteo fallback

---

## Database Schema

```sql
-- Sites imported from Rw.Location.Upload Excel
CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  lat REAL,
  lon REAL,
  nearest_gage_id TEXT,
  distance_to_gage_miles REAL,
  data_source TEXT CHECK(data_source IN ('maricopa', 'pima', 'open-meteo')),
  inspection_schedule TEXT DEFAULT 'option_b', -- option_a, option_b, option_c
  rain_threshold REAL DEFAULT 0.5,
  status TEXT DEFAULT 'active', -- active, completed, paused
  notion_page_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rain gauge readings (cached from FCD/RFCD)
CREATE TABLE rain_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gage_id TEXT NOT NULL,
  source TEXT CHECK(source IN ('maricopa', 'pima', 'open-meteo')),
  reading_time DATETIME NOT NULL,
  precipitation_24hr REAL,
  precipitation_6hr REAL,
  precipitation_1hr REAL,
  raw_data TEXT, -- JSON of full reading
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(gage_id, reading_time)
);

-- Triggered alerts when threshold exceeded
CREATE TABLE rain_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT REFERENCES sites(id),
  gage_id TEXT,
  precipitation_amount REAL,
  threshold REAL,
  triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  inspection_due_by DATETIME,
  inspection_id INTEGER REFERENCES inspections(id),
  status TEXT DEFAULT 'pending', -- pending, inspection_scheduled, completed, expired
  notified_at DATETIME,
  notification_method TEXT -- email, sms, push
);

-- Inspection records
CREATE TABLE inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT REFERENCES sites(id),
  inspector_name TEXT,
  inspector_email TEXT,
  inspection_type TEXT, -- routine, rain_event, complaint
  inspection_date DATETIME,
  weather_conditions TEXT,
  precipitation_since_last TEXT,
  
  -- Checklist items (JSON or separate table)
  checklist_data TEXT, -- JSON blob
  
  -- Findings
  bmp_deficiencies TEXT,
  corrective_actions TEXT,
  corrective_action_due_date DATE,
  
  -- Photos stored as paths/URLs
  photos TEXT, -- JSON array of photo URLs
  
  -- Signatures
  inspector_signature TEXT,
  site_contact_signature TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft', -- draft, submitted, approved
  submitted_at DATETIME,
  
  -- Notion sync
  notion_page_id TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for compliance
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT, -- site, inspection, alert
  entity_id TEXT,
  action TEXT, -- created, updated, notified, submitted
  details TEXT, -- JSON
  performed_by TEXT,
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Core Features

### 1. Rain Monitoring Dashboard

**Bird's Eye View** showing all sites on a map with color-coded status:

- 🟢 **Green**: No action needed
- 🟡 **Yellow**: Rain forecast, inspection may be needed
- 🔴 **Red**: Threshold exceeded, inspection required within 24hr
- ⚫ **Gray**: Completed/paused sites

**Map Features**:

- Toggle between satellite/street view
- Filter by status, region, client
- Click site for quick details popup
- Cluster sites at zoom levels

### 2. Automated Alert System

When 24hr precipitation ≥ threshold:

1. **Email Alert** (via `desert-services-hub/services/email`):

   ```
   Subject: ⚠️ Rain Inspection Required: [Site Name]
   
   Rain event detected at [Site Name] - [City]
   
   📊 Rainfall Data:
   - 24hr Total: 0.62"
   - Nearest Gauge: Buckeye FRS #1 (2.3 mi)
   - Threshold: 0.50"
   
   ⏰ Inspection Due: [Date/Time] (24 hours from now)
   
   📋 Quick Actions:
   [Schedule Inspection] [View Site Details] [Mark Complete]
   ```

2. **SMS Alert** (optional):

   ```
   DS SWPPP Alert: 0.62" rain at Buckeye Site. 
   Inspection due by 3pm tomorrow. 
   Reply DONE when complete.
   ```

3. **Notion Update**: Create inspection task with due date

### 3. Digital Inspection Form

Mobile-friendly form matching ADEQ requirements:

```
┌─────────────────────────────────────────┐
│  🔍 SWPPP Site Inspection               │
├─────────────────────────────────────────┤
│  Site: Buckeye Commerce Center          │
│  Date: Jan 27, 2026  Time: 2:30 PM      │
│  Inspector: [Auto-filled]               │
│  Weather: ☀️ Clear  72°F                 │
├─────────────────────────────────────────┤
│  📋 BMP CHECKLIST                       │
│                                         │
│  Perimeter Controls                     │
│  ┌─────────────────────────────────────┐│
│  │ ☑ Silt fence intact                ││
│  │ ☐ Fiber rolls secured              ││
│  │ ☑ No sediment bypass               ││
│  └─────────────────────────────────────┘│
│                                         │
│  Sediment Controls                      │
│  ┌─────────────────────────────────────┐│
│  │ ☑ Sediment basin functional        ││
│  │ ☑ Inlet protection in place        ││
│  │ ☐ Needs cleaning (50% capacity)    ││
│  └─────────────────────────────────────┘│
│                                         │
│  📸 PHOTOS                              │
│  [+ Add Photo]                          │
│  ┌────┐ ┌────┐ ┌────┐                   │
│  │ 📷 │ │ 📷 │ │ 📷 │                   │
│  └────┘ └────┘ └────┘                   │
│                                         │
│  📝 NOTES / DEFICIENCIES                │
│  ┌─────────────────────────────────────┐│
│  │ Fiber rolls on east side need      ││
│  │ repositioning after weekend rain.  ││
│  │ Corrective action: Maintenance     ││
│  │ to fix by 1/29/26.                 ││
│  └─────────────────────────────────────┘│
│                                         │
│  ✍️ SIGNATURES                          │
│  Inspector: [Signature Pad]             │
│  Site Contact: [Signature Pad]          │
│                                         │
│  [Save Draft]  [Submit Inspection]      │
└─────────────────────────────────────────┘
```

### 4. Report Generation

Auto-generate professional PDF reports matching ADEQ requirements:

- Site information header
- Inspection date/time/weather
- BMP checklist with pass/fail
- Photos with timestamps and GPS
- Deficiencies and corrective actions
- Inspector and site contact signatures
- Audit trail footer

### 5. Compliance Dashboard

**Metrics at a glance**:

- Sites requiring inspection (overdue highlighted)
- Inspection completion rate (last 30/60/90 days)
- Average response time to rain events
- Outstanding corrective actions
- Upcoming routine inspections

---

## UI/UX Approach

### Option A: Bun + React SPA (Recommended)

Build a modern SPA using your existing stack:

```
/inspections-app
├── src/
│   ├── index.html          # Entry point
│   ├── index.ts            # Bun.serve() backend
│   ├── frontend.tsx        # React app
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── SiteMap.tsx     # Mapbox/Leaflet integration
│   │   ├── InspectionForm.tsx
│   │   ├── AlertList.tsx
│   │   └── ReportViewer.tsx
│   ├── api/
│   │   ├── sites.ts
│   │   ├── inspections.ts
│   │   ├── weather.ts
│   │   └── alerts.ts
│   └── workers/
│       ├── rain-monitor.ts  # Cron job
│       └── notification.ts
├── inspections.db
└── package.json
```

**Benefits**:

- Uses existing Bun infrastructure
- Can deploy as Cloudflare Worker
- Full control over features
- Integrate with existing email service

### Option B: Retool/Notion Hybrid

For faster MVP:

- Use **Retool** for internal dashboard
- Use **Notion** databases for site/inspection tracking
- Keep Cloudflare Worker for rain monitoring
- Email alerts via existing service

**Benefits**:

- Faster to prototype
- Less code to maintain
- Team already uses Notion

### Option C: Fork Open Source

Adapt an existing solution:

- [Open311](https://www.open311.org/) - citizen reporting standard
- [Kobo Toolbox](https://www.kobotoolbox.org/) - mobile data collection
- Custom theme existing form builder

---

## Integration with Existing Systems

### 1. Email Service (`desert-services-hub/services/email`)

Already have Microsoft Graph client for:

- Sending alert emails with templates
- Searching for inspection reports from competitors (<inspections@desert-services.app>)
- Forwarding inspection reports to clients

### 2. Notion Database

Sync sites and inspections to Notion for:

- Team visibility
- Client-facing status updates
- Integration with existing workflows

### 3. Excel Import

Parse `Rw.Location.Upload - Main Master.xlsx` to:

- Import all 209 sites
- Geocode addresses to lat/lon
- Match to nearest rain gauges

---

## Implementation Phases

### Phase 1: Rain Monitoring Worker (MVP)

**Goal**: Automated alerts when rain threshold is hit

- [ ] Build Maricopa FCD parser (`ev_rain.txt`, `prpt.txt`)
- [ ] Build Pima RFCD HTML scraper
- [ ] Import sites from Excel, geocode addresses
- [ ] Match sites to nearest gauge (pre-compute)
- [ ] Cloudflare Worker cron (every 15 min)
- [ ] Email alerts via existing service
- [ ] Basic Notion integration (update site records)

**Deliverable**: When it rains 0.5"+, affected site managers get email within 15 minutes.

### Phase 2: Digital Inspection Forms

**Goal**: Replace paper forms with mobile-friendly digital inspections

- [ ] SQLite schema for inspections
- [ ] Mobile-responsive inspection form
- [ ] Photo upload with GPS tagging
- [ ] PDF report generation
- [ ] Email reports to clients

**Deliverable**: Inspectors can complete inspections on their phone and auto-email PDF to clients.

### Phase 3: Dashboard & Compliance Tracking

**Goal**: Bird's eye view of all sites and compliance status

- [ ] Interactive map with site markers
- [ ] Status filtering and search
- [ ] Compliance metrics dashboard
- [ ] Overdue inspection alerts
- [ ] Audit log for ADEQ requests

**Deliverable**: Management can see at-a-glance which sites need attention.

### Phase 4: Advanced Features

**Goal**: Full parity with ComplianceGo

- [ ] Rain forecast integration (NWS API)
- [ ] Automatic routine inspection scheduling
- [ ] Client portal (view their sites only)
- [ ] Corrective action workflow
- [ ] Multi-tenant support for subcontractors

---

## Cost Analysis

### Current Competitor Costs

| Sites | ComplianceGo | EnviroReport | Our Solution |
|-------|--------------|--------------|--------------|
| 50 | $250/mo | $750/mo | $0 (self-hosted) |
| 100 | $500/mo | $1,500/mo | $0 (self-hosted) |
| 200 | $1,000/mo | $3,000/mo | $0 (self-hosted) |

### Our Infrastructure Costs

| Service | Cost | Notes |
|---------|------|-------|
| Cloudflare Workers | Free | 100k requests/day free tier |
| Maricopa FCD Data | Free | Public data |
| Pima RFCD Data | Free | Public data |
| Open-Meteo API | Free | 10k requests/day free tier |
| Microsoft 365 | Existing | Already paying for email |
| Notion | Existing | Already using for project mgmt |

**Annual Savings**: $6,000 - $36,000 depending on competitor pricing

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| FCD website changes format | Multiple parsers, fallback to Open-Meteo |
| Gauge goes offline | Open-Meteo fallback, alert on missing data |
| Site outside gauge coverage | Open-Meteo with adjusted threshold (0.4") |
| Inspector doesn't see alert | Multiple channels (email + SMS + push) |
| ADEQ audit | Complete audit log, PDF archive of all inspections |

---

## Next Steps

1. **[ ] Validate with team**: Does this solve the actual pain points?
2. **[ ] Prototype rain parser**: Build parser for `ev_rain.txt` format
3. **[ ] Import sites**: Parse Excel, geocode, match to gauges
4. **[ ] Deploy MVP worker**: Cloudflare cron + email alerts
5. **[ ] User testing**: Run parallel with current process for 1 month
6. **[ ] Iterate**: Add inspection forms based on feedback

---

## Appendix: Sample Inspection Report Emails

The `inspections@desert-services.app` mailbox contains sample inspection reports from competitors that can be used as reference for report formatting. Use the email service to search:

```typescript
import { GraphEmailClient } from "@desert-services-hub/services/email";

const client = new GraphEmailClient(config);
client.initAppAuth();

const reports = await client.searchEmails({
  query: "SWPPP inspection report",
  userId: "inspections@desertservices.app",
  limit: 20,
});
```

---

## References

- [ADEQ CGP 2025 Permit](https://azdeq.gov/AZPDES/CGP)
- [Maricopa FCD Alert System](https://alert.fcd.maricopa.gov/)
- [Pima RFCD Alert Map](https://alertmap.rfcd.pima.gov/)
- [Open-Meteo API Docs](https://open-meteo.com/en/docs)
- [ComplianceGo Features](https://compliancego.com/features)

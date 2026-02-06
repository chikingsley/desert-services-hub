# SWPPP Labor Sync - n8n Workflow Plan

## Goal

Automatically parse SWPPP work descriptions from SharePoint Excel, extract structured data with AI, calculate labor estimates, and sync to Notion.

## Current State

- **n8n workflow**: Working end-to-end (`cFUdKSYBeqwKRdUV`)
- **n8n instance**: <https://n8n.desertservices.app>
- **SharePoint → Excel**: Graph API `/usedRange` returns JSON directly (no binary parsing needed)
- **AI extraction**: Google Gemini 2.5 Flash Lite with Information Extractor node
- **Labor calculation**: Working with rates applied
- **Notion sync**: Creating pages in Projects database with status determination

---

## Completed

### Workflow Nodes

- [x] **Hourly Schedule** - Triggers workflow hourly
- [x] **Get Azure Token** - OAuth2 client credentials flow
- [x] **Read Excel Sheet** - Graph API call to get "Confirmed Schedule" sheet as JSON
- [x] **Parse Excel** - Code node that converts Graph API response to row objects (filters to 10 items with description > 50 chars)
- [x] **Google Gemini Chat Model** - `gemini-2.5-flash-lite` for AI extraction
- [x] **Extract Work Items** - Information Extractor node (replaced AI Agent)
- [x] **Calculate Labor** - Applies labor rates, determines status, outputs estimates
- [x] **Create a database page** - Notion node creates projects with all fields

### Flow Diagram

```sql
Hourly Schedule
      ↓
Get Azure Token
      ↓
Read Excel Sheet (Graph API /usedRange → JSON)
      ↓
Parse Excel (converts JSON to row objects, limits to 10)
      ↓
Extract Work Items  ←──── Google Gemini Chat Model
      ↓
Calculate Labor (+ status determination)
      ↓
Create a database page (Notion Projects)
```css

### Notion Projects Mapping

| Notion Property | Source |
|-----------------|--------|
| Project Name | `jobName` |
| Contractor | `contractor` |
| Labor Hours | `laborHours` (calculated) |
| Status | `status` (determined from data) |
| Scheduling Notes | `schedulingNotes` (joined) |
| Address | `address` |
| Contact | `contact` |
| Scheduled Date | `scheduledDate` (Excel serial → ISO date) |
| Work Items | `workItemsSummary` |

### Status Determination Logic

```javascript
function determineStatus(scheduledDate, schedulingNotes, workDescription) {
  // Contains 'complete' or 'finished' → Done
  // Has a scheduled date → In progress
  // Contains 'ready now' → In progress
  // Default → Not started
}
```css

---

## TODO

### Deduplication & Updates

- [ ] Handle deduplication (match by job name + contractor?)
- [ ] Update existing Notion pages instead of creating duplicates
- [ ] Add Monday.com node to update Estimating board (if needed)

### Enhancements

- [ ] Add error handling/notifications (Slack/email on failure)
- [ ] Increase batch size beyond 10 rows once stable
- [ ] Add logging node to track what was processed
- [ ] Consider caching to avoid re-processing same rows

---

## Reference

### Labor Rates (minutes)

| Item | Rate |
|------|------|
| Base setup | 40 min |
| Panel install | 13 min/panel |
| Panel relocate | 10 min/panel |
| Panel remove | 5 min/panel |
| Sock install | 0.22 min/LF |
| Fence install | 0.15 min/LF |
| Inlet protect | 16 min/inlet |
| Delivery | 45 min flat |
| Narrative | 30 min flat |

### Work Units

`panels`, `sock_lf`, `fence_lf`, `screening_lf`, `inlets`, `signs`, `gates`, `other`

### Actions

`install`, `relocate`, `remove`, `deliver`, `narrative`, `other`

### Output Schema

```json
{
  "workItems": [
    {"action": "install", "quantity": 650, "unit": "fence_lf", "description": "temp fence"},
    {"action": "install", "quantity": 22, "unit": "inlets", "description": "protect inlets"}
  ],
  "schedulingNotes": ["Ready on 12-18-2025", "See Steve when you arrive"],
  "contactInfo": {"name": "Steve", "phone": "602-555-1234"}
}
```css

### Excel Date Conversion

Excel serial dates (days since Jan 1, 1900) → ISO date:

```javascript
$json.scheduledDate ? new Date(($json.scheduledDate - 25569) * 86400 * 1000).toISOString().split('T')[0] : ''
```

---

## Files

- `scripts/update-swppp-workflow.ts` - Script to update workflow programmatically
- `services/n8n/client.ts` - n8n API client
- Workflow: <https://n8n.desertservices.app/workflow/cFUdKSYBeqwKRdUV>
- Notion Projects: <https://www.notion.so/969ba4eedb9f4505a7c640519e82acce>

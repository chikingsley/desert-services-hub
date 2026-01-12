# Catalog Description Audit - Pending Items

**Status:** Partial changes applied - items below need further review/discussion

---

## 1. ERTEC Inlet Protection (CM-007 to CM-011) - NEEDS VERIFICATION

**Current pricing:**

| Code | Name | Price | Notes |
|------|------|-------|-------|
| CM-007 | ERTEC Size 1 | $185 | Cheapest option |
| CM-008 | ERTEC Size 2 | $252 | |
| CM-009 | ERTEC Size 3 | $378 | Similar to generic curb inlet ($375) |
| CM-010 | ERTEC Size 4 | $504 | |
| CM-011 | ERTEC Size 5 | $630 | Most expensive |

**Questions to resolve:**

1. What are the actual ERTEC size dimensions? (Verify with supplier)
2. What's the use case difference between generic curb inlet ($375) vs ERTEC products?
   - Size-based (ERTEC for larger inlets)?
   - Quality/reusability (ERTEC is reusable)?
   - Client preference?

**Action:** Verify actual dimensions with supplier before updating descriptions.

---

## 2. Water Trucks - NEEDS DISCUSSION

### Pricing Inconsistencies

| Code | Name | Rate | Notes |
|------|------|------|-------|
| WT-001 | On Call | $110/hr | Standard rate |
| WT-002 | Scheduled MWF | $115/hr | **More expensive than on-call - why?** |
| WT-003 | M-F 1x/day | $110/hr | Same as on-call |
| WT-004 | M-F 2x/day | $100/hr | Volume discount |
| WT-005 | Full Time | $95/hr | Best rate (8 hr commitment) |
| WT-006 | 4000 Gallon Truck | $145/hr | Larger capacity |
| WT-007 | 2000 Gallon Truck | $125/hr | Standard specialty |
| WT-008 | Nights/Weekend (2K) | $145/hr | After-hours premium |

### Questions to Resolve

**Scheduling options (WT-002, WT-003, WT-004):**

1. Why is Scheduled MWF ($115) more expensive than On Call ($110)? Shouldn't scheduled be cheaper?
2. Should we consolidate into fewer options?

**Perk/Flow/Lot Wash section (WT-006, WT-007, WT-008):**

Current category name "Perk/Flow/Lot Wash" is confusing. Questions:

1. What size trucks are used for dust control? If they're smaller, that explains the price difference.
2. What are these larger trucks actually used for? (Lot washdown? Compaction? Something else?)
3. Should we add a Nights/Weekend option for the 4000 gallon truck?

**Suggested category rename:** "Large Capacity Trucks" or "Specialty Water Delivery"

### WT-010 Split - APPROVED (Not yet applied)

Current: "Pump Water Out/Fill Tank" (combined)

Split into two separate line items:

- "Fill On-Site Storage Tanks" - $95/hr
- "Pump Standing Water" - $95/hr (pumping from excavations, flooded areas)

---

## Completed Changes

The following sections have been updated in `catalog.json`:

- Section 1: SWPPP Compliance
- Section 2: Control Measures (except ERTEC)
- Section 3: Dust Control Permits
- Section 4: Portable Toilets (name formatting fixed)
- Section 5: Tanks
- Section 6: Roll-off Dumpsters
- Section 8: Street Sweeping
- Section 9: Pressure Washing
- Section 10: Temporary Fencing
- Section 11: Water Equipment Rentals
- Section 12: Administrative & Fees

---

## Sources

- [ERTEC Environmental](https://ertecsystems.com/)

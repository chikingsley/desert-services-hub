# Gila River Indian Community (GRIC) Dust Permits

Potential addition to catalog.ts for projects on GRIC land.

## GRIC Fee Schedule

Source: [gricdeq.org/air-quality-permits](https://www.gricdeq.org/air-quality-permits)

- **1-10 acres**: $75.00 flat rate
- **10+ acres**: $36.00 per acre + $110.00 base fee

Example: 20 acres = (20 x $36) + $110 = $830

## Comparison with Current Jurisdictions

GRIC fees are significantly lower than Maricopa and Pima:

- GRIC 1-10 acres: $75
- Pima 1-2 acres: $100 (county fee only)
- Pima 2-10 acres: $500 (county fee only)
- Maricopa <1 acre: $570 (ADEQ fee only)
- Maricopa 1-5 acres: $1,130 (ADEQ fee only)

## Suggested Catalog Structure

```typescript
{
  id: "dust-control-gric",
  name: "Gila River (GRIC) Dust Control Permits",
  subcategories: [
    {
      id: "gric-earthmoving",
      name: "Earthmoving Permits",
      items: [
        {
          code: "GRIC-DUST-001",
          name: "GRIC Dust Permit (1-10 acres)",
          description: "Earthmoving permit for fugitive dust-generating operations on Gila River Indian Community land",
          price: 375,  // $75 GRIC fee + $300 Admin
          unit: "Each",
          notes: "GRIC Fee $75 + Admin $300",
        },
        {
          code: "GRIC-DUST-002",
          name: "GRIC Dust Permit (10-20 acres)",
          description: "Earthmoving permit for fugitive dust-generating operations on GRIC land",
          price: 970,  // ~$650 GRIC + $320 Admin
          unit: "Each",
          notes: "GRIC Fee (~$650) + Admin $320",
        },
        {
          code: "GRIC-DUST-003",
          name: "GRIC Dust Permit (20-50 acres)",
          description: "Earthmoving permit for fugitive dust-generating operations on GRIC land",
          price: 1750,  // ~$1,370 GRIC + $380 Admin
          unit: "Each",
          notes: "GRIC Fee (~$1,370) + Admin $380",
        },
        {
          code: "GRIC-DUST-004",
          name: "GRIC Dust Permit (50+ acres)",
          description: "Earthmoving permit for fugitive dust-generating operations on GRIC land. Contact for pricing on very large sites.",
          price: 2750,
          unit: "Each",
          notes: "GRIC Fee varies + Admin $480+",
        },
      ],
    },
  ],
},
```

## Key Requirements (from GRIC DEQ)

- Permits required for any fugitive dust-generating activity exceeding 1 acre
- Must submit Earthmoving Permit Application with Dust Control Plan
- GRIC entities are exempt from fees but still require permit application
- Agricultural operations currently exempt
- Regulations in Part V, Section 2.0 of the Air Quality Management Plan (AQMP)

## Contact

GRIC Department of Environmental Quality
- Phone: (520) 562-2234
- Hours: 8am - 5pm M-F
- Address: 124 Skill Center Rd, Sacaton, AZ 85147

## Decision Points

Before adding to catalog:

1. **Admin fee calibration** - What's the actual effort to file GRIC permits? Suggested $300-480 range based on Pima complexity
2. **Tier breakpoints** - GRIC only has 2 tiers (1-10, 10+), but may want more granularity for quoting
3. **Frequency** - How often do we quote GRIC projects? Worth adding if regular occurrence
4. **Signage requirements** - Does GRIC require dust control signs like Maricopa (5+ acres)?

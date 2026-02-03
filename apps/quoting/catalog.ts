// Service catalog for Desert Services estimates
// 2026 Pricing - Effective January 1st, 2026

import type {
  Catalog,
  CatalogCategory,
  CatalogItem,
  LineItem,
  TakeoffBundle,
} from "./types";

export const catalog: Catalog = {
  categories: [
    {
      id: "swppp",
      name: "SWPPP Compliance",
      items: [
        {
          code: "SWPPP-001",
          name: "SWPPP Plan Design",
          description:
            "Stormwater Pollution Prevention Plan with complete drawing set including site map, drainage areas, BMP locations & erosion control details",
          price: 2500,
          unit: "Each",
          notes: "+$375 to expedite",
        },
        {
          code: "SWPPP-002",
          name: "SWPPP Narrative",
          description:
            "Compliance document detailing site conditions, pollution sources, inspection schedules & BMP maintenance procedures",
          price: 1350,
          unit: "Each",
          notes: "Narrative-Only Jobs: $1,550",
        },
        {
          code: "SWPPP-003",
          name: "SWPPP Narrative (Standalone)",
          description:
            "Compliance document detailing site conditions, pollution sources, inspection schedules & BMP maintenance procedures",
          price: 1550,
          unit: "Each",
        },
        {
          code: "SWPPP-004",
          name: "Replacement Narrative",
          description:
            "Updated narrative for permit transfers, site changes, or expired documents",
          price: 875,
          unit: "Each",
        },
        {
          code: "SWPPP-005",
          name: "SWPPP Inspections",
          description:
            'Performed every 14 days or within 24 hrs of 0.5" rain event. Includes additional inspections for months with more than 4 weeks. Additional inspections for rain events and/or project extensions are not included & will be billed at $205 each.',
          price: 205,
          unit: "Per Visit",
          notes:
            "Add duration to name when quoting, e.g. (approximately 9 months)",
        },
        {
          code: "SWPPP-006",
          name: "SWPPP Inspection (28-day)",
          description:
            "Performed every 28 days for inactive or stabilized sites. Additional inspections for rain events and/or project extensions are not included & will be billed at $235 each.",
          price: 235,
          unit: "Per Visit",
          notes:
            "Add duration to name when quoting, e.g. (approximately 6 months)",
        },
      ],
    },
    {
      id: "control-measures",
      name: "SWPPP Control Measures",
      subcategories: [
        {
          id: "cm-entrances",
          name: "Site Entrances",
          items: [
            {
              code: "CM-001",
              name: "Rock Entrance",
              description:
                'Stabilized construction entrance (track-out prevention) using 6" rock over filter fabric to prevent sediment tracking onto public roads',
              price: 2625,
              unit: "Each",
              notes: "Price varies with rock availability",
            },
            {
              code: "CM-001B",
              name: "Rock Entrance Refresh",
              description:
                "Refresh/replenishment of existing rock entrance with new rock to maintain track-out prevention effectiveness",
              price: 2090,
              unit: "Each",
            },
            {
              code: "CM-002",
              name: "Rumble Grates Rental (Monthly)",
              description:
                "Heavy-duty steel grate system designed to vibrate sediment off vehicle tires at site exits, providing superior track-out prevention versus rock alone",
              price: 350,
              unit: "Month",
              notes: "Removal billed at trip charge",
            },
          ],
        },
        {
          id: "cm-perimeter",
          name: "Perimeter Control",
          items: [
            {
              code: "CM-003",
              name: "Compost Filter Sock",
              description:
                "9-inch compost filter sock (EPA approved alternative to silt fence). Staking included for standard applications.",
              price: 2.75,
              unit: "LF",
              notes: "Add for Staking if >4:1 slope at $0.50/LF",
            },
            {
              code: "CM-004",
              name: "Wire-Backed Silt Fence",
              description:
                "Installed via Tommy Slice Method with steel t-posts and orange safety caps. No gravel backfill required. Traps sediment from stormwater runoff.",
              price: 5.5,
              unit: "LF",
              notes: "Tommy Slice Method",
            },
          ],
        },
        {
          id: "cm-inlets",
          name: "Inlet Protection",
          items: [
            {
              code: "CM-005",
              name: "Drop Inlet Protection",
              description:
                "Filter barrier for storm drain grates that blocks sediment while allowing water flow",
              price: 152,
              unit: "Each",
            },
            {
              code: "CM-006",
              name: "Curb Inlet Protection",
              description:
                "Filter barrier for curb-style storm drains that blocks sediment while allowing water flow",
              price: 195,
              unit: "Each",
            },
          ],
        },
        {
          id: "cm-misc",
          name: "Other BMPs",
          items: [
            {
              code: "CM-012",
              name: "Spill Kit",
              description:
                "Emergency response kit for job site spills with absorbents, disposal bags & instructions",
              price: 360,
              unit: "Each",
            },
            {
              code: "CM-013",
              name: "SWPPP Site sign",
              description:
                "Displays project name, permit number, and ADEQ pollution hotline",
              price: 295,
              unit: "Each",
              notes: "Required for sites >= 1 acre",
            },
            {
              code: "CM-014",
              name: "Fire Access Sign",
              description:
                "Posted fire lane signage for emergency vehicle access that meets municipal fire code",
              price: 695,
              unit: "Each",
            },
            {
              code: "CM-016",
              name: "SWPPP Sticker",
              description:
                "Sticker displaying NOI Authorization ID (AZC #) for SWPPP compliance",
              price: 75,
              unit: "Each",
            },
            {
              code: "CM-017",
              name: "Dust Sticker",
              description: "Sticker for dust permit compliance signage",
              price: 75,
              unit: "Each",
            },
            {
              code: "CM-015",
              name: "Concrete Washout (15 yd)",
              description:
                "15 cubic yard contained washout basin that captures concrete truck rinse water to prevent runoff",
              price: 770,
              unit: "Each",
              notes: "Container only",
            },
          ],
        },
      ],
    },
    {
      id: "dust-control-maricopa",
      name: "Maricopa County Dust Control Permits",
      subcategories: [
        {
          id: "dust-permits",
          name: "Permit by Acreage",
          items: [
            {
              code: "DUST-001",
              name: "Maricopa Dust Permit (<1 acre)",
              description:
                "Includes ADEQ filing & dust control plan preparation.",
              price: 1070,
              unit: "Acre",
              notes: "ADEQ $570 + Admin $500",
            },
            {
              code: "DUST-002",
              name: "Maricopa Dust Permit (1-5 acres)",
              description:
                "Includes ADEQ filing & dust control plan preparation.",
              price: 1630,
              unit: "Acre",
              notes: "ADEQ $1,130 + Admin $500",
            },
            {
              code: "DUST-003",
              name: "Maricopa Dust Permit (5-10 acres)",
              description:
                "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
              price: 1630,
              unit: "Acre",
              notes: "ADEQ $1,130 + Admin $500",
            },
            {
              code: "DUST-004",
              name: "Maricopa Dust Permit (10-50 acres)",
              description:
                "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
              price: 4870,
              unit: "Acre",
              notes: "ADEQ $4,120 + Admin $750",
            },
            {
              code: "DUST-005",
              name: "Maricopa Dust Permit (50-100 acres)",
              description:
                "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
              price: 7870,
              unit: "Acre",
              notes: "ADEQ $6,870 + Admin $1,000",
            },
            {
              code: "DUST-006",
              name: "Maricopa Dust Permit (100-500 acres)",
              description:
                "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
              price: 11_560,
              unit: "Acre",
              notes: "ADEQ $10,310 + Admin $1,250",
            },
            {
              code: "DUST-007",
              name: "Maricopa Dust Permit (500+ acres)",
              description:
                "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
              price: 18_490,
              unit: "Acre",
              notes: "ADEQ $16,490 + Admin $2,000",
            },
          ],
        },
        {
          id: "dust-signage",
          name: "Signage",
          items: [
            {
              code: "DUST-008",
              name: "Dust Control sign",
              description:
                "Required for sites over 5 acres. Displays permit number and required contact information.",
              price: 595,
              unit: "Each",
              notes: "Required for sites over 5 acres",
            },
          ],
        },
      ],
    },
    {
      id: "dust-control-pima",
      name: "Pima County Dust Control Permits",
      subcategories: [
        {
          id: "pima-earthmoving",
          name: "Land Stripping/Earthmoving",
          items: [
            {
              code: "PIMA-DUST-001",
              name: "Pima Dust Permit - Earthmoving (1-2 acres)",
              description:
                "Dust permit covering earthmoving and land disturbance for 1 to 2 acres",
              price: 350,
              unit: "Each",
              notes: "County Fee $100 + Admin $250",
            },
            {
              code: "PIMA-DUST-002",
              name: "Pima Dust Permit - Earthmoving (2-10 acres)",
              description:
                "Dust permit covering earthmoving and land disturbance for 2 to 10 acres",
              price: 1000,
              unit: "Each",
              notes: "County Fee $500 + Admin $500",
            },
            {
              code: "PIMA-DUST-003",
              name: "Pima Dust Permit - Earthmoving (10-40 acres)",
              description:
                "Dust permit covering earthmoving and land disturbance for 10 to 40 acres",
              price: 2250,
              unit: "Each",
              notes: "County Fee $1,500 + Admin $750",
            },
            {
              code: "PIMA-DUST-004",
              name: "Pima Dust Permit - Earthmoving (40+ acres)",
              description:
                "Dust permit covering earthmoving and land disturbance for 40+ acres",
              price: 4000,
              unit: "Each",
              notes: "County Fee $3,000 + Admin $1,000",
            },
          ],
        },
        {
          id: "pima-trenching",
          name: "Trenching",
          items: [
            {
              code: "PIMA-TRENCH-001",
              name: "Pima Dust Permit - Trenching (300-500 ft)",
              description:
                "Dust permit covering trenching excavations for 300 to 500 linear feet",
              price: 325,
              unit: "Each",
              notes: "County Fee $75 + Admin $250",
            },
            {
              code: "PIMA-TRENCH-002",
              name: "Pima Dust Permit - Trenching (501-1500 ft)",
              description:
                "Dust permit covering trenching excavations for 501 to 1500 linear feet",
              price: 450,
              unit: "Each",
              notes: "County Fee $200 + Admin $250",
            },
            {
              code: "PIMA-TRENCH-003",
              name: "Pima Dust Permit - Trenching (1501-5000 ft)",
              description:
                "Dust permit covering trenching excavations for 1501 to 5000 linear feet",
              price: 650,
              unit: "Each",
              notes: "County Fee $400 + Admin $250",
            },
            {
              code: "PIMA-TRENCH-004",
              name: "Pima Dust Permit - Trenching (5001+ ft)",
              description:
                "Dust permit covering trenching excavations for 5001+ linear feet",
              price: 1300,
              unit: "Each",
              notes: "County Fee $800 + Admin $500",
            },
          ],
        },
        {
          id: "pima-road",
          name: "Road Construction",
          items: [
            {
              code: "PIMA-ROAD-001",
              name: "Pima Dust Permit - Road (50-1000 ft)",
              description:
                "Dust permit covering road construction for 50 to 1000 linear feet",
              price: 300,
              unit: "Each",
              notes: "County Fee $50 + Admin $250",
            },
            {
              code: "PIMA-ROAD-002",
              name: "Pima Dust Permit - Road (1001-3000 ft)",
              description:
                "Dust permit covering road construction for 1001 to 3000 linear feet",
              price: 500,
              unit: "Each",
              notes: "County Fee $250 + Admin $250",
            },
            {
              code: "PIMA-ROAD-003",
              name: "Pima Dust Permit - Road (3001-6000 ft)",
              description:
                "Dust permit covering road construction for 3001 to 6000 linear feet",
              price: 1000,
              unit: "Each",
              notes: "County Fee $500 + Admin $500",
            },
            {
              code: "PIMA-ROAD-004",
              name: "Pima Dust Permit - Road (6001+ ft)",
              description:
                "Dust permit covering road construction for 6001+ linear feet",
              price: 1500,
              unit: "Each",
              notes: "County Fee $1,000 + Admin $500",
            },
          ],
        },
        {
          id: "pima-other",
          name: "Other Permits",
          items: [
            {
              code: "PIMA-BLAST-001",
              name: "Pima Dust Permit - Blasting",
              description:
                "Dust permit for blasting operations and controlled use of explosives",
              price: 275,
              unit: "Each",
              notes: "County Fee $25 + Admin $250",
            },
            {
              code: "PIMA-MULTI-001",
              name: "Pima Dust Permit - Multi-Activity (1-10 acres)",
              description:
                "Dust permit covering multiple dust-producing activities for 1 to 10 acres",
              price: 1125,
              unit: "Each",
              notes: "County Fee $625 + Admin $500",
            },
            {
              code: "PIMA-MULTI-002",
              name: "Pima Dust Permit - Multi-Activity (10-40 acres)",
              description:
                "Dust permit covering multiple dust-producing activities for 10 to 40 acres",
              price: 2750,
              unit: "Each",
              notes: "County Fee $2,000 + Admin $750",
            },
            {
              code: "PIMA-MULTI-003",
              name: "Pima Dust Permit - Multi-Activity (40+ acres)",
              description:
                "Dust permit covering multiple dust-producing activities for 40+ acres",
              price: 5000,
              unit: "Each",
              notes: "County Fee $4,000 + Admin $1,000",
            },
            {
              code: "PIMA-DEMO-001",
              name: "Pima Asbestos Permit - Demolition",
              description:
                "Dust permit covering asbestos removal in demolition",
              price: 670,
              unit: "Each",
              notes: "County Fee $420 + Admin $250",
            },
            {
              code: "PIMA-RENO-001",
              name: "Pima Asbestos Permit - Renovation",
              description:
                "Dust permit covering asbestos removal in renovation",
              price: 670,
              unit: "Each",
              notes: "County Fee $420 + Admin $250",
            },
          ],
        },
      ],
    },
    {
      id: "portable-toilets",
      name: "Portable Toilets",
      subcategories: [
        {
          id: "pt-standard",
          name: "Standard Porta John",
          items: [
            {
              code: "PT-003",
              name: "Standard Porta John (1x/week)",
              description:
                "Weekly cleaning, trash removal, restocking +10% fuel surcharge",
              price: 127,
              unit: "Unit/Month",
            },
            {
              code: "PT-004",
              name: "Standard Porta John (2x/week)",
              description:
                "Twice weekly cleaning, trash removal, restocking +10% fuel surcharge",
              price: 167,
              unit: "Unit/Month",
            },
            {
              code: "PT-005",
              name: "Standard Porta John (3x/week)",
              description:
                "Three times weekly cleaning, trash removal, restocking +10% fuel surcharge",
              price: 197,
              unit: "Unit/Month",
            },
          ],
        },
        {
          id: "pt-handwash",
          name: "Handwash Stations",
          items: [
            {
              code: "PT-006",
              name: "Handwash Station (1x/week)",
              description:
                "Weekly cleaning, restocking, fresh water +10% fuel surcharge",
              price: 200,
              unit: "Unit/Month",
            },
            {
              code: "PT-007",
              name: "Handwash Station (2x/week)",
              description:
                "Twice weekly cleaning, restocking, fresh water +10% fuel surcharge",
              price: 250,
              unit: "Unit/Month",
            },
            {
              code: "PT-008",
              name: "Handwash Station (3x/week)",
              description:
                "Three times weekly cleaning, restocking, fresh water +10% fuel surcharge",
              price: 290,
              unit: "Unit/Month",
            },
          ],
        },
        {
          id: "pt-ada",
          name: "ADA Compliant",
          items: [
            {
              code: "PT-009",
              name: "ADA Porta John (1x/week)",
              description: "ADA compliant, weekly cleaning +10% fuel surcharge",
              price: 200,
              unit: "Unit/Month",
            },
            {
              code: "PT-010",
              name: "ADA Porta John (2x/week)",
              description:
                "ADA compliant, twice weekly cleaning +10% fuel surcharge",
              price: 250,
              unit: "Unit/Month",
            },
            {
              code: "PT-011",
              name: "ADA Porta John (3x/week)",
              description:
                "ADA compliant, three times weekly cleaning +10% fuel surcharge",
              price: 290,
              unit: "Unit/Month",
            },
          ],
        },
        {
          id: "pt-fees",
          name: "Fees & Extras",
          items: [
            {
              code: "PT-001",
              name: "Porta John Delivery/Pickup",
              description:
                "Per unit, charged on install (covers pickup) +10% fuel surcharge",
              price: 50,
              unit: "Each",
            },
            {
              code: "PT-002",
              name: "Porta John Relocation",
              description: "Move unit to new location on site",
              price: 25,
              unit: "Each",
            },
            {
              code: "PT-012",
              name: "Hand Sanitizer",
              description: "Mounted sanitizer dispenser",
              price: 25,
              unit: "Each",
            },
          ],
        },
      ],
    },
    {
      id: "tanks",
      name: "Tanks",
      subcategories: [
        {
          id: "tank-install",
          name: "Installation",
          items: [
            {
              code: "TANK-001",
              name: "Full Tank System Install",
              description:
                "Freshwater + waste tank system for job site trailers with plumbing connections & setup",
              price: 1200,
              unit: "Each",
            },
            {
              code: "TANK-002",
              name: "Waste Tank Install",
              description:
                "Holding tank for trailer waste water including hookup to existing plumbing",
              price: 600,
              unit: "Each",
            },
            {
              code: "TANK-009",
              name: "Freshwater Tank Install",
              description:
                "Potable water tank for job site trailers including pump & plumbing connections",
              price: 600,
              unit: "Each",
            },
          ],
        },
        {
          id: "tank-waste-service",
          name: "Waste Tank Service",
          items: [
            {
              code: "TANK-003",
              name: "Waste Tank Service (1x/week)",
              description: "Weekly waste tank pump-out service",
              price: 550,
              unit: "Month",
            },
            {
              code: "TANK-004",
              name: "Waste Tank Service (2x/week)",
              description: "Twice-weekly waste tank pump-out service",
              price: 1100,
              unit: "Month",
            },
          ],
        },
        {
          id: "tank-full-service",
          name: "Full Tank Service",
          items: [
            {
              code: "TANK-005",
              name: "Full Tank System Service (1x/week)",
              description:
                "Weekly service for both freshwater & waste tanks with pump-out & refill",
              price: 750,
              unit: "Month",
            },
            {
              code: "TANK-006",
              name: "Full Tank System Service (2x/week)",
              description:
                "Twice-weekly service for both freshwater & waste tanks",
              price: 1500,
              unit: "Month",
            },
          ],
        },
        {
          id: "tank-other",
          name: "Other",
          items: [
            {
              code: "TANK-007",
              name: "Waste Tank Removal",
              description:
                "Final pump-out & tank removal at project completion",
              price: 250,
              unit: "Each",
            },
            {
              code: "TANK-008",
              name: "Waste Tank Standalone Fee",
              description:
                "Additional monthly fee when tank service is the only service on site (no porta johns)",
              price: 150,
              unit: "Month",
            },
            {
              code: "TANK-010",
              name: "Freshwater Tank Rental",
              description:
                "500+ gallon potable water tank rental for job site use",
              price: 450,
              unit: "Month",
            },
          ],
        },
      ],
    },
    {
      id: "roll-off",
      name: "Roll-off Dumpsters",
      subcategories: [
        {
          id: "ro-sizes",
          name: "Container Sizes",
          items: [
            {
              code: "RO-001",
              name: "10 yd Roll-Off",
              description:
                "10 cubic yard dumpster for small jobs with 2 tons disposal",
              price: 360,
              unit: "Per Pull",
              notes: "+10% fuel surcharge. Inactivity fee after 21 days",
            },
            {
              code: "RO-002",
              name: "15 yd Roll-Off",
              description:
                "15 cubic yard dumpster for residential/light commercial with 2 tons disposal",
              price: 370,
              unit: "Per Pull",
              notes: "+10% fuel surcharge. Inactivity fee after 21 days",
            },
            {
              code: "RO-003",
              name: "20 yd Roll-Off",
              description:
                "20 cubic yard dumpster for mid-size projects with 2 tons disposal",
              price: 400,
              unit: "Per Pull",
              notes: "+10% fuel surcharge. Inactivity fee after 21 days",
            },
            {
              code: "RO-004",
              name: "30 yd Roll-Off",
              description:
                "30 cubic yard dumpster for large projects with 3 tons disposal",
              price: 440,
              unit: "Per Pull",
              notes: "+10% fuel surcharge. Inactivity fee after 21 days",
            },
            {
              code: "RO-005",
              name: "40 yd Roll-Off",
              description:
                "40 cubic yard dumpster for major construction with 4 tons disposal",
              price: 470,
              unit: "Per Pull",
              notes: "+10% fuel surcharge. Inactivity fee after 21 days",
            },
          ],
        },
        {
          id: "ro-fees",
          name: "Fees",
          items: [
            {
              code: "RO-006",
              name: "Roll-off Overage Fee",
              description:
                "Additional disposal fee for weight exceeding included tonnage",
              price: 65,
              unit: "Per Ton",
            },
            {
              code: "RO-007",
              name: "Roll-off Inactivity Fee",
              description:
                "Daily fee when container sits 21+ days without haul with exchange resetting the clock",
              price: 20,
              unit: "Per Day",
            },
            {
              code: "RO-008",
              name: "Roll-off Relocate/Wait Fee",
              description:
                "On-site container relocation or non-scheduled service visit",
              price: 155,
              unit: "Each",
            },
          ],
        },
      ],
    },
    {
      id: "water-trucks",
      name: "Water Trucks",
      items: [
        {
          code: "WT-001",
          name: "Water Truck w/ Operator",
          description:
            "Dust control, soil stabilization, lot/street washes. 2 hr minimum. +10% fuel surcharge",
          price: 127,
          unit: "Hour",
          defaultQty: 2,
        },
        {
          code: "WT-002",
          name: "Soil Stabilization (Gorilla Glue)",
          description:
            "Covers vehicle, driver, and materials. +10% fuel surcharge",
          price: 2350,
          unit: "Acre",
        },
      ],
    },
    {
      id: "street-sweeping",
      name: "Street Sweeping",
      items: [
        {
          code: "SS-001",
          name: "Street Sweeper w/ Operator",
          description:
            "On-demand mechanical sweeping for tracked mud & debris on public roads. 2 hr minimum. +10% fuel surcharge",
          price: 137,
          unit: "Hour",
          defaultQty: 2,
        },
      ],
    },
    {
      id: "pressure-washing",
      name: "Pressure Washing",
      subcategories: [
        {
          id: "pw-truck",
          name: "Pressure Wash Truck",
          items: [
            {
              code: "PW-001",
              name: "Pressure Wash (Regular Hours)",
              description:
                "Hot/cold pressure washing for concrete, equipment, or building exteriors. 2 hr min. +10% fuel surcharge",
              price: 130,
              unit: "Hour",
              defaultQty: 2,
            },
            {
              code: "PW-002",
              name: "Pressure Wash (After Hours)",
              description:
                "After-hours pressure washing for occupied buildings or night pours. 2 hr min. +10% fuel surcharge",
              price: 145,
              unit: "Hour",
              defaultQty: 2,
            },
          ],
        },
        {
          id: "pw-equipment",
          name: "Specialty Equipment",
          items: [
            {
              code: "PW-003",
              name: "Ride-on Auto Scrubber",
              description:
                "Industrial floor scrubber for warehouse, garage, or interior concrete cleaning",
              price: 155,
              unit: "Hour",
              defaultQty: 2,
            },
            {
              code: "PW-004",
              name: "Ride-on Garage Sweeper",
              description:
                "Mechanical sweeper for parking garages & enclosed structures",
              price: 155,
              unit: "Hour",
              defaultQty: 2,
            },
          ],
        },
        {
          id: "pw-labor",
          name: "Labor",
          items: [
            {
              code: "PW-005",
              name: "Pressure Wash Labor",
              description:
                "Additional crew member for large-area or detailed work",
              price: 45,
              unit: "Hour",
              defaultQty: 2,
            },
          ],
        },
      ],
    },
    {
      id: "temp-fencing",
      name: "Temporary Fencing",
      subcategories: [
        {
          id: "tf-service",
          name: "Installation & Rental",
          items: [
            {
              code: "TF-001",
              name: "Fence Install",
              description:
                "Chain-link panel installation with driven posts or weighted stands with one swing gate",
              price: 1.75,
              unit: "LF",
              notes: "Trip charge not included",
            },
            {
              code: "TF-002",
              name: "Fence Rental (Monthly)",
              description:
                "6' chain-link panel rental billed per linear foot monthly ($100 min)",
              price: 0.3,
              unit: "LF/Month",
            },
            {
              code: "TF-003",
              name: "Privacy Screen",
              description:
                "HDPE mesh screen attached to fence panels with 85% opacity for privacy & dust control",
              price: 2.9,
              unit: "LF",
              notes: "Tax additional",
            },
            {
              code: "TF-005",
              name: "Fencing Trip Charge",
              description:
                "Service call for fence installation, relocations, or repairs",
              price: 285,
              unit: "Each",
            },
          ],
        },
        {
          id: "tf-replacement",
          name: "Replacement Parts",
          items: [
            {
              code: "TF-004",
              name: "Fence Stand Sandbags",
              description: "Per sandbag, delivered and installed",
              price: 7.5,
              unit: "Each",
            },
            {
              code: "TF-006",
              name: "Fence Panel",
              description: "Replacement panel",
              price: 125,
              unit: "Each",
            },
            {
              code: "TF-007",
              name: "Fence Pole",
              description: "Replacement pole",
              price: 25,
              unit: "Each",
            },
            {
              code: "TF-008",
              name: "Fence Stand",
              description: "Replacement stand",
              price: 25,
              unit: "Each",
            },
            {
              code: "TF-009",
              name: "Fence Bracket",
              description: "Replacement bracket",
              price: 5,
              unit: "Each",
            },
          ],
        },
      ],
    },
    {
      id: "water-equipment",
      name: "Water Equipment Rentals",
      subcategories: [
        {
          id: "we-buffalo",
          name: "Water Buffalo",
          items: [
            {
              code: "WE-001",
              name: "Water Buffalo Rental (Daily)",
              description:
                "400-500 gal towable water trailer with pump for dust control, compaction, or equipment washdown",
              price: 135,
              unit: "Day",
              notes: "+ delivery/pickup",
            },
            {
              code: "WE-002",
              name: "Water Buffalo Rental (Weekly)",
              description: "400-500 gal towable water trailer with pump",
              price: 380,
              unit: "Week",
              notes: "+ delivery/pickup",
            },
            {
              code: "WE-003",
              name: "Water Buffalo Rental (Monthly)",
              description: "400-500 gal towable water trailer with pump",
              price: 880,
              unit: "Month",
              notes: "+ delivery/pickup",
            },
          ],
        },
        {
          id: "we-donkey",
          name: "Water Donkey",
          items: [
            {
              code: "WE-004",
              name: "Water Donkey Rental (Monthly)",
              description:
                "Compact water tank (100-200 gal) for limited access areas or hand watering",
              price: 95,
              unit: "Month",
            },
            {
              code: "WE-005",
              name: "Water Donkey Hoses",
              description:
                "Lay-flat discharge hose for water donkey connection",
              price: 1.95,
              unit: "LF",
            },
            {
              code: "WE-006",
              name: "Water Donkey Delivery",
              description: "Water donkey delivery, setup & initial fill",
              price: 225,
              unit: "Each",
              notes: "Location dependent",
            },
          ],
        },
        {
          id: "we-ramps",
          name: "Water Ramps",
          items: [
            {
              code: "WE-008",
              name: "Water Ramps Rental (Monthly)",
              description:
                "Rubber hose protector ramps that allow vehicle traffic over water lines",
              price: 17,
              unit: "LF/Mo",
            },
            {
              code: "WE-009",
              name: "Water Ramps Hoses",
              description:
                "Replacement or additional hose for water ramp systems",
              price: 1.25,
              unit: "LF",
            },
            {
              code: "WE-010",
              name: "Water Ramps Delivery",
              description:
                "Water ramp delivery & setup with traffic barricades",
              price: 225,
              unit: "Each",
            },
          ],
        },
        {
          id: "we-other",
          name: "Other Equipment",
          items: [
            {
              code: "WE-007",
              name: "Backflow Device Rental (Monthly)",
              description:
                "Certified backflow preventer for hydrant/meter connection required by water utility",
              price: 245,
              unit: "Month",
              notes: "+ certification + delivery",
            },
          ],
        },
      ],
    },
    {
      id: "site-cleaning",
      name: "Site Cleaning",
      items: [
        {
          code: "SC-001",
          name: "Site Cleaning Labor",
          description:
            "Interior/exterior site cleaning. 4 hr minimum unless regularly scheduled",
          price: 45,
          unit: "Hour",
          defaultQty: 4,
        },
      ],
    },
    {
      id: "admin",
      name: "Administrative & Fees",
      items: [
        {
          code: "ADMIN-001",
          name: "Mobilization / Trip Charge",
          description:
            "Standard trip charge for crew dispatch covering BMP install, repair, or site visits",
          price: 265,
          unit: "Each",
        },
        {
          code: "ADMIN-002",
          name: "CCIP/OCIP/Insurance Portal",
          description:
            "Administration and documentation for wrap-up insurance enrollment & contractor portal compliance",
          price: 250,
          unit: "Each",
        },
        {
          code: "ADMIN-003",
          name: "Textura Setup",
          description:
            "One-time setup for Oracle Textura payment management system with vendor onboarding",
          price: 100,
          unit: "Each",
        },
        {
          code: "ADMIN-004",
          name: "Textura/Procore Processing",
          description:
            "Monthly processing fee for Textura or Procore billing with lien waiver management",
          price: 100,
          unit: "Each",
        },
      ],
    },
  ],
};

// Takeoff bundles - predefined item groups for PDF measurement tools
export const takeoffBundles: TakeoffBundle[] = [
  {
    id: "bundle-temp-fencing",
    name: "Temporary Fencing",
    description:
      "Chain-link fence installation - measures linear feet and creates Install, Rental, and optional add-ons",
    unit: "LF",
    toolType: "linear",
    color: "#f97316",
    items: [
      { code: "TF-001", isRequired: true, quantityMultiplier: 1 }, // Fence Install
      { code: "TF-002", isRequired: true, quantityMultiplier: 1 }, // Fence Rental (Monthly)
      { code: "TF-003", isRequired: false, quantityMultiplier: 1 }, // Privacy Screen
      { code: "TF-005", isRequired: false, quantityMultiplier: 1 }, // Fencing Trip Charge
    ],
  },
  {
    id: "bundle-silt-fence",
    name: "Silt Fence",
    description: "Wire-backed silt fence installation - measures linear feet",
    unit: "LF",
    toolType: "linear",
    color: "#84cc16",
    items: [
      { code: "CM-004", isRequired: true, quantityMultiplier: 1 }, // Wire-Backed Silt Fence
    ],
  },
  {
    id: "bundle-filter-sock",
    name: "Compost Filter Sock",
    description:
      "9-inch compost filter sock installation - measures linear feet",
    unit: "LF",
    toolType: "linear",
    color: "#a855f7",
    items: [
      { code: "CM-003", isRequired: true, quantityMultiplier: 1 }, // Compost Filter Sock
    ],
  },
  {
    id: "bundle-drop-inlet",
    name: "Drop Inlet Protection",
    description: "Storm drain inlet protection - count each inlet",
    unit: "Each",
    toolType: "count",
    color: "#3b82f6",
    items: [
      { code: "CM-005", isRequired: true, quantityMultiplier: 1 }, // Drop Inlet Protection
    ],
  },
  {
    id: "bundle-curb-inlet",
    name: "Curb Inlet Protection",
    description: "Curb-style drain inlet protection - count each inlet",
    unit: "Each",
    toolType: "count",
    color: "#06b6d4",
    items: [
      { code: "CM-006", isRequired: true, quantityMultiplier: 1 }, // Curb Inlet Protection
    ],
  },
  {
    id: "bundle-rock-entrance",
    name: "Rock Entrance",
    description: "Stabilized construction entrance - count each entrance",
    unit: "Each",
    toolType: "count",
    color: "#78716c",
    items: [
      { code: "CM-001", isRequired: true, quantityMultiplier: 1 }, // Rock Entrance
    ],
  },
];

// Get all items from catalog as flat list
export function getAllItems(): CatalogItem[] {
  const items: CatalogItem[] = [];

  for (const category of catalog.categories) {
    if (category.items) {
      for (const item of category.items) {
        items.push(item);
      }
    }

    if (category.subcategories) {
      for (const sub of category.subcategories) {
        for (const item of sub.items) {
          items.push(item);
        }
      }
    }
  }

  return items;
}

// Find item by code
export function findItem(code: string): CatalogItem | null {
  for (const item of getAllItems()) {
    if (item.code === code) {
      return item;
    }
  }
  return null;
}

// Find category by id
export function findCategory(id: string): CatalogCategory | null {
  for (const category of catalog.categories) {
    if (category.id === id) {
      return category;
    }
  }
  return null;
}

// Check if code exists in category items or subcategory items
function categoryContainsCode(
  category: CatalogCategory,
  code: string
): boolean {
  const directMatch =
    category.items?.some((item) => item.code === code) ?? false;
  if (directMatch) {
    return true;
  }

  return (
    category.subcategories?.some((sub) =>
      sub.items.some((item) => item.code === code)
    ) ?? false
  );
}

// Find category containing an item by code
export function findItemCategory(
  code: string
): { categoryId: string; categoryName: string } | null {
  const category = catalog.categories.find((cat) =>
    categoryContainsCode(cat, code)
  );
  if (category) {
    return { categoryId: category.id, categoryName: category.name };
  }
  return null;
}

// Create a line item from catalog code
export function createLineItem(code: string, qty?: number): LineItem | null {
  const catalogItem = findItem(code);
  if (catalogItem === null) {
    return null;
  }

  const quantity = qty ?? catalogItem.defaultQty ?? 1;

  return {
    id: crypto.randomUUID(),
    item: catalogItem.name,
    description: catalogItem.description,
    qty: quantity,
    uom: catalogItem.unit,
    cost: catalogItem.price,
    total: catalogItem.price * quantity,
  };
}

// Create multiple line items from codes
export function createLineItems(
  items: Array<{ code: string; qty?: number }>
): LineItem[] {
  const lineItems: LineItem[] = [];

  for (const { code, qty } of items) {
    const lineItem = createLineItem(code, qty);
    if (lineItem !== null) {
      lineItems.push(lineItem);
    }
  }

  return lineItems;
}

// Calculate total from line items
export function calculateTotal(lineItems: LineItem[]): number {
  let total = 0;
  for (const item of lineItems) {
    total += item.total;
  }
  return total;
}

// Get takeoff bundles formatted for the takeoff editor
export function getTakeoffItems() {
  return takeoffBundles.map((bundle) => {
    const bundleItems = bundle.items
      .map((bundleItem) => {
        const catalogItem = findItem(bundleItem.code);
        if (!catalogItem) {
          return null;
        }
        return {
          id: `bi-${bundleItem.code}`,
          itemId: bundleItem.code,
          code: bundleItem.code,
          name: catalogItem.name,
          unit: catalogItem.unit,
          price: catalogItem.price,
          isRequired: bundleItem.isRequired,
          quantityMultiplier: bundleItem.quantityMultiplier,
        };
      })
      .filter((item) => item !== null);

    return {
      id: bundle.id,
      code: `BUNDLE-${bundle.id.slice(0, 8).toUpperCase()}`,
      label: bundle.name,
      description: bundle.description,
      unit: bundle.unit,
      unitPrice: 0,
      unitCost: 0,
      color: bundle.color,
      type: bundle.toolType,
      isBundle: true,
      bundleItems,
      categoryId: null,
      categoryName: "Takeoff Bundles",
      subcategoryId: null,
      subcategoryName: null,
      notes: null,
      defaultQty: 1,
    };
  });
}

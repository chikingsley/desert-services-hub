import type { CatalogCategory } from "@estimates/catalog/types";

export const swpppCategory: CatalogCategory = {
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
      notes: "Add duration to name when quoting, e.g. (approximately 9 months)",
    },
    {
      code: "SWPPP-006",
      name: "SWPPP Inspection (28-day)",
      description:
        "Performed every 28 days for inactive or stabilized sites. Additional inspections for rain events and/or project extensions are not included & will be billed at $235 each.",
      price: 235,
      unit: "Per Visit",
      notes: "Add duration to name when quoting, e.g. (approximately 6 months)",
    },
    {
      code: "SWPPP-007",
      name: "SWPPP Reserve",
      description:
        "Allowance for unknown SWPPP BMP installs, repairs, and compliance scope discovered during the project.",
      price: 0,
      unit: "Lump Sum",
      notes: "Use estimate-specific reserve amount",
    },
  ],
};

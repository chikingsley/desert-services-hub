import type { CatalogCategory } from "@estimates/catalog/types";

export const rollOffCategory: CatalogCategory = {
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
};

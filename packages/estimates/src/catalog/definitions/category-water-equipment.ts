import type { CatalogCategory } from "@estimates/catalog/types";

export const waterEquipmentCategory: CatalogCategory = {
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
          description: "Lay-flat discharge hose for water donkey connection",
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
          description: "Replacement or additional hose for water ramp systems",
          price: 1.25,
          unit: "LF",
        },
        {
          code: "WE-010",
          name: "Water Ramps Delivery",
          description: "Water ramp delivery & setup with traffic barricades",
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
};

import type { CatalogCategory } from "@/packages/estimates/catalog/types";

export const pressureWashingCategory: CatalogCategory = {
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
          description: "Additional crew member for large-area or detailed work",
          price: 45,
          unit: "Hour",
          defaultQty: 2,
        },
      ],
    },
  ],
};

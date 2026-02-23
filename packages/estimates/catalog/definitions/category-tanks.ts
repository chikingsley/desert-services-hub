import type { CatalogCategory } from "@/packages/estimates/catalog/types";

export const tanksCategory: CatalogCategory = {
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
          description: "Twice-weekly service for both freshwater & waste tanks",
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
          description: "Final pump-out & tank removal at project completion",
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
          description: "500+ gallon potable water tank rental for job site use",
          price: 450,
          unit: "Month",
        },
      ],
    },
  ],
};

import type { CatalogCategory } from "@/packages/estimates/catalog/types";

export const dustControlPimaCategory: CatalogCategory = {
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
          description: "Dust permit covering asbestos removal in demolition",
          price: 670,
          unit: "Each",
          notes: "County Fee $420 + Admin $250",
        },
        {
          code: "PIMA-RENO-001",
          name: "Pima Asbestos Permit - Renovation",
          description: "Dust permit covering asbestos removal in renovation",
          price: 670,
          unit: "Each",
          notes: "County Fee $420 + Admin $250",
        },
      ],
    },
  ],
};

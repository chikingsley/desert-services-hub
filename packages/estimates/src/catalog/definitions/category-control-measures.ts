import type { CatalogCategory } from "@estimates/catalog/types";

export const controlMeasuresCategory: CatalogCategory = {
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
          name: "SWPPP Sign",
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
};

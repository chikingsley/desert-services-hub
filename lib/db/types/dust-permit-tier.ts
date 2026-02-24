export interface DustPermitTier {
  adeqFee: number;
  filingFee: number;
  label: string;
  max: number;
  min: number;
  price: number;
}

export const DUST_PERMIT_TIERS: DustPermitTier[] = [
  {
    min: 0.1,
    max: 0.99,
    price: 1070,
    label: "<1 acre",
    adeqFee: 570,
    filingFee: 500,
  },
  {
    min: 1,
    max: 4.99,
    price: 1630,
    label: "1 - 5 acres",
    adeqFee: 1130,
    filingFee: 500,
  },
  {
    min: 5,
    max: 9.99,
    price: 1630,
    label: "5 - 10 acres",
    adeqFee: 1130,
    filingFee: 500,
  },
  {
    min: 10,
    max: 49,
    price: 4870,
    label: "10 - 49 acres",
    adeqFee: 4120,
    filingFee: 750,
  },
  {
    min: 50,
    max: 99,
    price: 7870,
    label: "50 - 99 acres",
    adeqFee: 6870,
    filingFee: 1000,
  },
  {
    min: 100,
    max: 499,
    price: 11_560,
    label: "100 - 499 acres",
    adeqFee: 10_310,
    filingFee: 1250,
  },
  {
    min: 500,
    max: Number.POSITIVE_INFINITY,
    price: 18_490,
    label: "500+ acres",
    adeqFee: 16_490,
    filingFee: 2000,
  },
];

export function getDustPermitTier(acres: number): DustPermitTier | null {
  for (const tier of DUST_PERMIT_TIERS) {
    if (acres >= tier.min && acres <= tier.max) {
      return tier;
    }
  }
  return null;
}

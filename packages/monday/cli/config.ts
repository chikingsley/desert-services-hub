/**
 * Shared CLI configuration.
 */

export const BOARDS: Record<string, string> = {
  contacts: "7943937855",
  contractors: "7943937856",
  dust_permits: "9850624269",
  estimating: "7943937851",
  inspection_reports: "8791849123",
  leads: "7943937841",
  projects: "8692330900",
  service_lines: "8686470518",
  swppp_plans: "9778304069",
};

export const ESTIMATING_NON_PROD_GROUPS = [
  "Shell Estimates ( Do Not Move)",
  "Sales Team Estimates",
];

export function resolveBoardId(nameOrId: string): string {
  return BOARDS[nameOrId.toLowerCase()] ?? nameOrId;
}

export function getBoardKeys(): string[] {
  return Object.keys(BOARDS);
}

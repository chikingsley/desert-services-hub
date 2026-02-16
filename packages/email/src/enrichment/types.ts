/**
 * Enrichment Service Types (non-PDL)
 *
 * PDL types are now in ./pdl/types.ts
 */

// Avatar types
export interface AvatarResult {
  url: string;
  source: "gravatar" | "initials" | "clearbit";
}

// Company logo types
export interface LogoResult {
  url: string;
  exists: boolean;
}

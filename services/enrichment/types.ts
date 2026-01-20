/**
 * Enrichment Service Types (non-PDL)
 *
 * PDL types are now in ./pdl/types.ts
 */

// Avatar types
export type AvatarResult = {
  url: string;
  source: "gravatar" | "initials" | "clearbit";
};

// Company logo types
export type LogoResult = {
  url: string;
  exists: boolean;
};

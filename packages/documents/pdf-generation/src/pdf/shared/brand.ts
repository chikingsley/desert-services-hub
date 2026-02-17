// Desert Services brand constants — shadcn/ui semantic token convention
// Each color has a purpose; foreground companions define text-on-that-color.
// Shared across all company PDF documents.

export const COLORS = {
  /** Page-level base — white paper */
  background: "#FFFFFF",
  /** Body text — deep charcoal */
  foreground: "#2F2F2F",

  /** Desert terra cotta — brand headings, section titles, accents */
  primary: "#C2622D",
  /** Text on primary backgrounds */
  primaryForeground: "#FFFFFF",

  /** Warm sand gold — highlights, subtle accents */
  secondary: "#D4A653",
  /** Text on secondary backgrounds */
  secondaryForeground: "#2F2F2F",

  /** Warm off-white — card/callout backgrounds, inactive surfaces */
  muted: "#F6F5F3",
  /** Dimmed text on muted — captions, footnotes, subtle text */
  mutedForeground: "#656565",

  /** Teal — links, interactive elements, hover highlights */
  accent: "#1A5F7A",
  /** Text on accent backgrounds */
  accentForeground: "#FFFFFF",

  /** Red — warnings, destructive actions, errors */
  destructive: "#DC2626",
  /** Text on destructive backgrounds */
  destructiveForeground: "#FFFFFF",

  /** Lines, separators, table borders */
  border: "#DDDDDD",
  /** Focus rings — matches primary */
  ring: "#C2622D",
} as const;

// Font family names — shared by client (generate-client) and server (fonts.ts)
export const FONT_BODY = "Roboto";
export const FONT_TITLE = "Times";

export const COMPANY = {
  name: "Desert Services LLC",
  /** Formatted phone: (480) 513-8986 */
  phone: "(480) 513-8986",
  /** Compact phone for footers: 480-513-8986 */
  phoneCompact: "480-513-8986",
  fax: "480-657-2057",
  website: "desertservices.net",
  poBox: "PO Box 14695, Scottsdale, AZ 85267",
  roc: "198030",
  email: "info@desertservices.net",
} as const;

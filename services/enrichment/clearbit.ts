/**
 * Clearbit Logo API
 *
 * Free logo API for company domains (no API key required).
 */
import type { LogoResult } from "./types";

const CLEARBIT_LOGO_BASE = "https://logo.clearbit.com";

/**
 * Get Clearbit logo URL for a domain
 */
export function getLogoUrl(domain: string): string {
  return `${CLEARBIT_LOGO_BASE}/${domain}`;
}

/**
 * Check if a logo exists for the domain
 */
export async function checkLogoExists(domain: string): Promise<boolean> {
  try {
    const url = getLogoUrl(domain);
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get logo URL with existence check
 */
export async function getLogo(domain: string): Promise<LogoResult> {
  const url = getLogoUrl(domain);
  const exists = await checkLogoExists(domain);
  return { url, exists };
}

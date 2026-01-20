/**
 * Avatar Utilities
 *
 * Generates avatar URLs for contacts using various services:
 * - Gravatar: Email-based avatars (if user has one)
 * - UI Avatars: Initials-based fallback (always works)
 */
import type { AvatarResult } from "./types";

/**
 * Generate Gravatar URL from email
 * Returns 404 if no gravatar exists for the email
 */
export function getGravatarUrl(email: string, size = 200): string {
  const hash = new Bun.CryptoHasher("md5")
    .update(email.toLowerCase().trim())
    .digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}`;
}

/**
 * Generate UI Avatars URL from name (initials-based, always works)
 */
export function getUIAvatarUrl(name: string, size = 200): string {
  const encoded = encodeURIComponent(name);
  return `https://ui-avatars.com/api/?name=${encoded}&size=${size}&background=random&bold=true`;
}

/**
 * Check if a URL returns a valid response
 */
export async function checkUrlExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the best available avatar URL for a contact
 * Tries Gravatar first, falls back to UI Avatars
 */
export async function getAvatarUrl(
  name: string,
  email: string
): Promise<AvatarResult> {
  const gravatarUrl = getGravatarUrl(email);
  const hasGravatar = await checkUrlExists(gravatarUrl);

  if (hasGravatar) {
    return { url: gravatarUrl, source: "gravatar" };
  }

  return { url: getUIAvatarUrl(name), source: "initials" };
}

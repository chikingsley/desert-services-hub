/**
 * OData helper functions for Microsoft Graph API
 */

/**
 * Escapes a string for use in OData queries
 * @param str - The string to escape
 * @returns The escaped string
 */
export function escapeODataString(str: string | null | undefined): string {
  if (!str) {
    return str ?? "";
  }

  // Replace single quotes with double single quotes (OData escaping)
  // And remove any special characters that could cause OData syntax errors
  let escaped = str.replace(/'/g, "''");

  // Escape other potentially problematic characters
  escaped = escaped.replace(/[(){}[\]:;,/?&=+*%$#@!^]/g, "");

  console.error(`Escaped OData string: '${escaped}'`);
  return escaped;
}

/**
 * Builds an OData filter from filter conditions
 * @param conditions - Array of filter conditions
 * @returns Combined OData filter expression
 */
export function buildODataFilter(conditions: string[]): string {
  if (!conditions || conditions.length === 0) {
    return "";
  }

  return conditions.join(" and ");
}

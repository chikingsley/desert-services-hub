/**
 * Email Templates
 *
 * Simple template loader with variable substitution.
 *
 * Usage:
 *   import { loadTemplate, fillTemplate, getTemplate } from './templates';
 *
 *   // Load and fill in one step
 *   const html = await getTemplate('dust-permit-issued', {
 *     recipientName: 'LeAnn',
 *     projectName: 'Kiwanis Playground',
 *     ...
 *   });
 */

const TEMPLATES_DIR = import.meta.dir;
const IF_BLOCK_PATTERN = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

export type TemplateVars = Record<string, string | number>;

/**
 * Load a template file by name (without .hbs extension)
 */
export async function loadTemplate(name: string): Promise<string> {
  const path = `${TEMPLATES_DIR}/${name}.hbs`;
  const file = Bun.file(path);

  if (!(await file.exists())) {
    throw new Error(`Template not found: ${name}`);
  }

  return await file.text();
}

/**
 * Fill template variables using {{variable}} syntax
 * Also supports:
 * - {{{variable}}} for raw/unescaped HTML (same as {{variable}} in our engine)
 * - {{#if variable}}...{{/if}} conditionals
 */
export function fillTemplate(template: string, vars: TemplateVars): string {
  // Handle {{#if var}}...{{/if}} blocks first
  let result = template.replace(IF_BLOCK_PATTERN, (_, varName, content) => {
    const value = vars[varName];
    // Show content if value is truthy and not empty string
    return value && value !== "" ? content : "";
  });

  // Replace {{{variable}}} (triple braces - raw HTML) first, then {{variable}}
  for (const [key, value] of Object.entries(vars)) {
    // Triple braces (raw HTML)
    const triplePattern = new RegExp(`\\{\\{\\{${key}\\}\\}\\}`, "g");
    result = result.replace(triplePattern, String(value));
    // Double braces
    const doublePattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(doublePattern, String(value));
  }

  return result;
}

/**
 * Load and fill a template in one step
 */
export async function getTemplate(
  name: string,
  vars: TemplateVars
): Promise<string> {
  const template = await loadTemplate(name);
  return fillTemplate(template, vars);
}

/**
 * List available templates
 */
export async function listTemplates(): Promise<string[]> {
  const glob = new Bun.Glob("*.hbs");
  const templates: string[] = [];

  for await (const file of glob.scan(TEMPLATES_DIR)) {
    templates.push(file.replace(".hbs", ""));
  }

  return templates;
}

/**
 * Signature configuration
 */
export interface SignatureConfig {
  name: string;
  title: string;
  email: string;
  phone?: string;
}

/**
 * Default signature (Chi's info) - used when no signature is specified
 */
export const DEFAULT_SIGNATURE: SignatureConfig = {
  name: "Chi Ejimofor",
  title: "Project Coordinator",
  email: "chi@desertservices.net",
  phone: "(304) 405-2446",
};

/**
 * Standard signature block (HTML)
 */
export function getSignature(options: SignatureConfig): string {
  let sig = `<div style="font-family: 'Aptos', sans-serif; font-size: 12pt;">Best,</div>
<div>--</div>
<div><br></div>
<div style="font-family: 'Aptos', sans-serif; font-size: 12pt;">${options.name}</div>
<div style="font-family: 'Aptos', sans-serif; font-size: 12pt;">${options.title}</div>
<div style="font-family: 'Aptos', sans-serif; font-size: 12pt;">E: <a href="mailto:${options.email}">${options.email}</a></div>`;

  if (options.phone) {
    sig += `\n<div style="font-family: 'Aptos', sans-serif; font-size: 12pt;">M: ${options.phone}</div>`;
  }

  return sig;
}

/**
 * Get the default signature HTML
 */
export function getDefaultSignature(): string {
  return getSignature(DEFAULT_SIGNATURE);
}

/**
 * Wrap a plain body with the simple email template and signature
 *
 * @param body - Plain text or HTML body content (will be wrapped in divs if plain text)
 * @param options - Optional signature config (uses DEFAULT_SIGNATURE if not provided)
 * @returns HTML email body with signature and logo placeholder
 *
 * @example
 * const html = await wrapWithSignature("Hello, this is my message.");
 * // Returns HTML with message + Chi's signature + logo
 */
export async function wrapWithSignature(
  body: string,
  options?: {
    signature?: SignatureConfig;
    includeLogo?: boolean;
    embedLogo?: boolean;
  }
): Promise<string> {
  const signature = getSignature(options?.signature ?? DEFAULT_SIGNATURE);
  const includeLogo = options?.includeLogo ?? true;
  const embedLogo = options?.embedLogo ?? false;

  // Convert plain text to HTML paragraphs if needed
  const htmlBody = body.includes("<")
    ? body
    : body
        .split("\n")
        .map((line) => `<div>${line || "<br>"}</div>`)
        .join("\n");

  let logoSrc = "cid:logo";
  if (includeLogo && embedLogo) {
    logoSrc = await getLogoDataUri();
  }

  const template = await loadTemplate("simple");
  return fillTemplate(template, {
    body: htmlBody,
    signature,
    showLogo: includeLogo ? "true" : "",
    logoSrc,
  });
}

/**
 * Get the logo as a base64 data URI for direct embedding in HTML.
 * More reliable than cid: references which depend on email client resolution.
 */
export async function getLogoDataUri(): Promise<string> {
  const logoPath = `${TEMPLATES_DIR}/desert-services-logo.png`;
  const file = Bun.file(logoPath);

  if (!(await file.exists())) {
    throw new Error(`Logo not found: ${logoPath}`);
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:image/png;base64,${base64}`;
}

/**
 * Load the Desert Services logo as an inline attachment
 * Use with sendEmail's attachments array:
 *
 * @example
 * const logo = await getLogoAttachment();
 * await email.sendEmail({
 *   body: html, // HTML with <img src="cid:logo">
 *   attachments: [logo],
 *   ...
 * });
 */
export async function getLogoAttachment(): Promise<{
  name: string;
  contentType: string;
  contentBytes: string;
  contentId: string;
  isInline: boolean;
}> {
  const logoPath = `${TEMPLATES_DIR}/desert-services-logo.png`;
  const file = Bun.file(logoPath);

  if (!(await file.exists())) {
    throw new Error(`Logo not found: ${logoPath}`);
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  return {
    name: "desert-services-logo.png",
    contentType: "image/png",
    contentBytes: base64,
    contentId: "logo",
    isInline: true,
  };
}

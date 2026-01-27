/**
 * SWPPP Email Templates
 *
 * Template loader for SWPPP workflow notifications.
 * Self-contained module that can be used independently.
 */

const TEMPLATES_DIR = import.meta.dir;

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
 */
export function fillTemplate(template: string, vars: TemplateVars): string {
  let result = template;

  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(pattern, String(value));
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
 * Load the Desert Services logo as an inline attachment
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

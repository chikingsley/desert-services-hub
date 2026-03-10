/**
 * Form Schema API
 *
 * Exposes FormData JSON Schema and defaults for MCP/agent consumption.
 * Agents call these endpoints to understand the structure of permit form data
 * without needing to read source code.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { DEFAULTS } from "@/form-data";
import { FormDataSchema } from "@/lib/form-data-validation";

// Cache the JSON Schema at module load (it doesn't change at runtime)
const formDataJsonSchema = zodToJsonSchema(
  FormDataSchema as unknown as Parameters<typeof zodToJsonSchema>[0],
  {
    name: "FormData",
    $refStrategy: "none",
  }
);

// Strip payment and _meta from defaults (sensitive / internal)
const {
  payment: _,
  _meta: __,
  ...safeDefaults
} = DEFAULTS;

export function handleFormSchema(): Response {
  return Response.json(formDataJsonSchema);
}

export function handleFormDefaults(): Response {
  return Response.json(safeDefaults);
}

import type { ZodError, ZodSchema } from "zod";

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details: ZodError };

/**
 * Validate input with a Zod schema - returns formatted error for MCP
 *
 * Use this in MCP handlers to validate agent inputs with helpful errors.
 */
export function validateMCPInput<T>(
  schema: ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format errors nicely for AI agents
  // Zod uses 'issues' in v3+, but some versions use 'errors'
  const issues =
    result.error.issues ??
    (result.error as unknown as { errors: typeof result.error.issues })
      .errors ??
    [];
  const errors = issues.map((e) => {
    const path = e.path.join(".");
    const field = path || "input";
    return `• ${field}: ${e.message}`;
  });

  const errorMessage = `Validation failed:\n${errors.join("\n")}`;

  return {
    success: false,
    error: errorMessage,
    details: result.error,
  };
}

/**
 * Assert input is valid or throw - for internal use
 *
 * Use this when you expect valid data and want to fail fast.
 */
export function assertValid<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Try to parse, return undefined on failure - for optional validation
 */
export function tryParse<T>(
  schema: ZodSchema<T>,
  data: unknown
): T | undefined {
  const result = schema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Format a ZodError into a human-readable string
 */
export function formatZodError(error: ZodError): string {
  const issues =
    error.issues ??
    (error as unknown as { errors: typeof error.issues }).errors ??
    [];
  return issues
    .map((e) => {
      const path = e.path.join(".");
      return path ? `${path}: ${e.message}` : e.message;
    })
    .join("\n");
}

/**
 * Create a validation middleware for API routes
 */
export function createValidator<T>(schema: ZodSchema<T>) {
  return {
    /**
     * Validate and return result
     */
    validate: (input: unknown): ValidationResult<T> => {
      return validateMCPInput(schema, input);
    },

    /**
     * Validate or throw
     */
    parse: (input: unknown): T => {
      return schema.parse(input);
    },

    /**
     * Validate and return data or undefined
     */
    tryParse: (input: unknown): T | undefined => {
      return tryParse(schema, input);
    },
  };
}

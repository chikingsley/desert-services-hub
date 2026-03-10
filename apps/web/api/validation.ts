/**
 * Shared Zod schemas for the web API request layer.
 *
 * These replace the copy-pasted parsePositiveInt / parseSort / parseMultiFilter
 * helpers scattered across route files. Each schema accepts raw query-param
 * strings (or undefined when the key is absent) and produces validated types.
 */

import { z } from "zod";

/** Coerce a query-param string to a positive integer, falling back on error. */
export const pageParam = z.coerce.number().int().min(1).catch(1);
export const perPageParam = z.coerce.number().int().min(1).max(200).catch(50);

export const paginationSchema = z.object({
  page: pageParam,
  perPage: perPageParam,
});
export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Build a sort schema for a specific route's allowed fields.
 *
 * Accepts "field.direction" strings (e.g. "name.asc"), validates the field
 * against an allowlist, and defaults direction to "desc".
 */
export function sortParam<T extends string>(
  fields: readonly T[],
  defaultField: T,
  defaultDirection: "asc" | "desc" = "desc"
) {
  return z
    .string()
    .transform((v) => {
      const [f, d] = v.split(".");
      return {
        field: (fields as readonly string[]).includes(f)
          ? (f as T)
          : defaultField,
        direction: (d === "asc" ? "asc" : "desc") as "asc" | "desc",
      };
    })
    .catch({ field: defaultField, direction: defaultDirection });
}

/**
 * Parse a comma-separated filter string into a deduplicated array.
 * Strips "all", trims whitespace, caps at 50 values.
 */
export const multiFilter = z
  .string()
  .transform((v) =>
    [
      ...new Set(
        v
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s !== "all")
      ),
    ].slice(0, 50)
  )
  .catch([] as string[]);

/** Parse "1" / "true" query-param strings to boolean. */
export const flagParam = z
  .string()
  .transform((v) => v === "1" || v === "true")
  .catch(false);

/** Trim and default to empty string. */
export const searchParam = z.string().trim().catch("");

/** Coerce a path segment to a positive integer (for numeric IDs). */
export const pathId = z.coerce.number().int().positive();

/** Convert URL searchParams to a plain object for Zod parsing. */
export function parseQuery<T extends z.ZodType>(
  url: URL,
  schema: T
): z.infer<T> {
  return schema.parse(Object.fromEntries(url.searchParams));
}

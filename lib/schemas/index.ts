/**
 * Quote Schema System - Single Source of Truth
 *
 * This module exports all Zod schemas and types for the quoting system.
 * All TypeScript types are derived from Zod schemas via z.infer<>.
 *
 * CANONICAL FIELD NAMES:
 * - name: The item name (e.g., "SWPPP Narrative")
 * - description: Optional notes/details
 * - quantity: Amount (never "qty")
 * - unit: Unit of measure (never "uom")
 * - unitPrice: Price charged to client (never "cost")
 */

export * from "./contact";
// Database row schemas and transforms
export * from "./db-rows";
// Core domain schemas
export * from "./line-item";
export * from "./manual-inputs";

// Input schemas
export * from "./mcp-inputs";
export * from "./quote";
export * from "./section";

// Validation utilities
export * from "./validation";

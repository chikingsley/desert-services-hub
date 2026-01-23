/**
 * Mistral client factory for extraction tasks
 * Provides consistent configuration for all extraction agents.
 */
import { Mistral } from "@mistralai/mistralai";

/**
 * Create a Mistral client configured for extraction.
 * Throws if MISTRAL_API_KEY is not set.
 */
export function createMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MISTRAL_API_KEY environment variable is required for extraction"
    );
  }
  return new Mistral({ apiKey });
}

/**
 * Default model for extraction tasks.
 * mistral-large-latest provides best accuracy for structured extraction.
 */
export const EXTRACTION_MODEL = "mistral-large-latest";

/**
 * Standard extraction settings.
 * - temperature: 0 for deterministic extraction
 * - maxTokens: 2048 for complex schemas (SOV line items can be large)
 */
export const EXTRACTION_SETTINGS = {
  temperature: 0,
  maxTokens: 2048,
} as const;

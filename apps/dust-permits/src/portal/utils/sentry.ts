/**
 * Sentry Error Tracking
 *
 * Initialize once at app startup, then errors are automatically captured.
 * For manual capture, use captureError() or captureMessage().
 *
 * Setup:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Add SENTRY_DSN to your .env file
 * 3. Import and call initSentry() at the top of your entry points
 */

import {
  captureException,
  init,
  captureMessage as sentryCaptureMessage,
} from "@sentry/bun";

let initialized = false;

export function initSentry() {
  if (initialized) {
    return;
  }
  if (!process.env.SENTRY_DSN) {
    console.warn("[Sentry] SENTRY_DSN not set, error tracking disabled");
    return;
  }

  init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 1 : 0.1,
  });

  initialized = true;
  console.log("[Sentry] Initialized");
}

/**
 * Wrap an async function with Sentry error tracking
 */
export async function withSentry<T>(
  operation: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    captureException(error, {
      extra: context,
      tags: { operation },
    });
    throw error;
  }
}

/**
 * Capture an error with context
 */
export function captureError(
  error: Error,
  context?: {
    operation?: string;
    sessionId?: number;
    pageId?: string;
    step?: string;
    extra?: Record<string, unknown>;
  }
) {
  captureException(error, {
    extra: {
      sessionId: context?.sessionId,
      pageId: context?.pageId,
      ...context?.extra,
    },
    tags: {
      operation: context?.operation,
      step: context?.step,
    },
  });
}

/**
 * Log a message to Sentry (for non-error events you want to track)
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
) {
  sentryCaptureMessage(message, level);
}

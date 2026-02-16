/**
 * Rate Limiter for Microsoft Graph API
 *
 * Enforces proactive rate limiting to avoid 429 errors.
 * Limits: 10,000 requests per 10 minutes per mailbox (~16.67/sec)
 *
 * Uses a sliding window token bucket algorithm.
 *
 * References:
 * - https://learn.microsoft.com/en-us/graph/throttling
 * - https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */
export class RateLimiter {
  // Graph API limit: 10,000 requests per 10 minutes = ~16.67/sec
  // We use 15/sec (90% of limit) - leaves some headroom
  private readonly maxRequestsPerSecond = 15;
  private readonly windowMs = 1000; // 1 second window
  private requestTimestamps: number[] = [];

  /**
   * Wait if necessary to respect rate limits
   */
  async throttle(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove timestamps outside the window
    this.requestTimestamps = this.requestTimestamps.filter(
      (t) => t > windowStart
    );

    // If at limit, wait until oldest request falls outside window
    if (this.requestTimestamps.length >= this.maxRequestsPerSecond) {
      const oldestInWindow = this.requestTimestamps[0];
      const waitTime = oldestInWindow + this.windowMs - now + 10; // +10ms buffer
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }

    // Record this request
    this.requestTimestamps.push(Date.now());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay with full jitter
   *
   * Formula: delay = random(0, min(cap, base * 2^attempt))
   *
   * @param attempt - Retry attempt number (0-indexed)
   * @param retryAfterMs - Optional Retry-After header value in ms (takes precedence)
   * @returns Delay in milliseconds
   */
  static calculateBackoff(attempt: number, retryAfterMs?: number): number {
    // If server provided Retry-After, use it with small jitter
    if (retryAfterMs && retryAfterMs > 0) {
      // Add 0-10% jitter to Retry-After to prevent thundering herd
      const jitter = Math.random() * retryAfterMs * 0.1;
      return retryAfterMs + jitter;
    }

    // Exponential backoff with full jitter
    // Base: 1000ms, Factor: 2, Cap: 60000ms (60 seconds)
    const BASE_DELAY_MS = 1000;
    const FACTOR = 2;
    const MAX_DELAY_MS = 60_000;

    const exponentialDelay = BASE_DELAY_MS * FACTOR ** attempt;
    const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);

    // Full jitter: random value between 0 and cappedDelay
    return Math.random() * cappedDelay;
  }
}

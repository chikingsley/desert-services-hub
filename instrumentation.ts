/**
 * Next.js Instrumentation
 * This file runs once when the server starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeBuckets } = await import("@/lib/minio");

    try {
      await initializeBuckets();
    } catch (error) {
      // Don't crash the app if MinIO isn't available (e.g., during build)
      console.warn("Failed to initialize storage buckets:", error);
    }
  }
}

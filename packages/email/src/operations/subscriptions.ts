/**
 * Graph API change notification subscription operations.
 *
 * Manages webhook subscriptions for real-time notifications
 * when mail resources change (new mail, updates, etc.).
 */

import type { GraphClientContext } from "@email/types";

/**
 * Create a Graph API change notification subscription.
 *
 * Registers a webhook subscription so Microsoft pushes notifications
 * when the specified resource changes.
 */
export async function createSubscription(
  ctx: GraphClientContext,
  request: {
    resource: string;
    changeType: string;
    notificationUrl: string;
    expirationDateTime: string;
    clientState: string;
  }
): Promise<{ id: string; expirationDateTime: string }> {
  const client = ctx.getClient();
  await ctx.rateLimiter.throttle();

  const response = await client.api("/subscriptions").post(request);
  return {
    expirationDateTime: response.expirationDateTime as string,
    id: response.id as string,
  };
}

/**
 * Renew a subscription with a new expiration.
 */
export async function renewSubscription(
  ctx: GraphClientContext,
  subscriptionId: string,
  expirationDateTime: string
): Promise<void> {
  const client = ctx.getClient();
  await ctx.rateLimiter.throttle();

  await client
    .api(`/subscriptions/${subscriptionId}`)
    .patch({ expirationDateTime });
}

/**
 * Delete a subscription.
 */
export async function deleteSubscription(
  ctx: GraphClientContext,
  subscriptionId: string
): Promise<void> {
  const client = ctx.getClient();
  await ctx.rateLimiter.throttle();

  await client.api(`/subscriptions/${subscriptionId}`).delete();
}

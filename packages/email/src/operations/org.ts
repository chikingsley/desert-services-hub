/**
 * Organization-level email operations.
 *
 * User listing, multi-mailbox search, and team mailbox
 * shortcuts for app-auth workflows.
 */

import { filterEmails, searchEmails } from "@email/operations/search";
import type { EmailMessage, GraphClientContext } from "@email/types";

/** Contracts mailbox address for the organization. */
export const CONTRACTS_MAILBOX = "contracts@desertservices.net";

/**
 * Estimating team mailboxes in priority order.
 * Used by searchEstimatingMailboxes() for team-wide searches.
 */
export const ESTIMATING_MAILBOXES = [
  "jared@desertservices.net",
  "jeff@desertservices.net",
  "denise@desertservices.net",
  "estimating@desertservices.net",
] as const;

/** Common search options shared across org mailbox search functions. */
interface OrgSearchOptions {
  query: string;
  limit?: number;
  since?: Date;
  until?: Date;
}

/** Throw if the context is not app-authenticated. */
function requireAppAuth(ctx: GraphClientContext, caller: string): void {
  if (ctx.authMode !== "app") {
    throw new Error(`${caller} requires app authentication`);
  }
}

/**
 * List all users in the tenant.
 *
 * Returns users with their ID, email address, and display name.
 * Only works with app authentication.
 *
 * @param ctx - Graph client context
 * @returns Promise resolving to array of user objects
 *
 * @example
 * const users = await listUsers(ctx);
 * // [{ id: '...', email: 'user@example.com', displayName: 'John Doe' }]
 */
export async function listUsers(ctx: GraphClientContext): Promise<
  {
    id: string;
    email: string;
    displayName: string;
    accountEnabled: boolean;
  }[]
> {
  const client = ctx.getClient();
  const response = await client
    .api("/users")
    .select("id,displayName,mail,userPrincipalName,accountEnabled")
    .top(999)
    .get();

  if (!response?.value) {
    return [];
  }

  return response.value
    .filter((u: Record<string, unknown>) => u.mail || u.userPrincipalName)
    .map((u: Record<string, unknown>) => ({
      accountEnabled: (u.accountEnabled as boolean) ?? true,
      displayName: (u.displayName ?? "") as string,
      email: (u.mail ?? u.userPrincipalName) as string,
      id: u.id as string,
    }));
}

/**
 * Get list of active mailboxes in the organization.
 *
 * Probes each user mailbox to verify access. The caller is responsible
 * for caching the result (the client facade manages the activeMailboxCache).
 * Requires app authentication with Mail.Read application permission.
 *
 * @param ctx - Graph client context
 * @param cachedMailboxes - Optional cached result. If provided, returned immediately.
 * @returns Promise resolving to array of accessible mailbox email addresses
 *
 * @example
 * const mailboxes = await getActiveMailboxes(ctx);
 * // ['user1@example.com', 'user2@example.com', ...]
 */
export async function getActiveMailboxes(
  ctx: GraphClientContext,
  cachedMailboxes?: string[] | null
): Promise<string[]> {
  requireAppAuth(ctx, "getActiveMailboxes");

  if (cachedMailboxes) {
    return cachedMailboxes;
  }

  const client = ctx.getClient();
  const users = await listUsers(ctx);
  const active: string[] = [];

  for (const user of users) {
    try {
      await client
        .api(`/users/${user.email}/messages`)
        .top(1)
        .select("id")
        .get();
      active.push(user.email);
    } catch {
      // Mailbox inaccessible -- skip
    }
  }

  return active;
}

/**
 * Search across all mailboxes in the organization in parallel.
 *
 * Discovers all active mailboxes and searches each one simultaneously.
 * Requires app authentication with Mail.Read application permission.
 *
 * @param ctx - Graph client context
 * @param options - Search configuration
 * @param cachedMailboxes - Optional cached active mailbox list
 * @returns Promise resolving to array of results grouped by mailbox (only mailboxes with results)
 *
 * @example
 * const results = await searchAllMailboxes(ctx, {
 *   query: 'DocuSign contract',
 *   limit: 5,
 * });
 * for (const { mailbox, emails } of results) {
 *   console.log(`${mailbox}: ${emails.length} matches`);
 * }
 */
export async function searchAllMailboxes(
  ctx: GraphClientContext,
  options: OrgSearchOptions,
  cachedMailboxes?: string[] | null
): Promise<{ mailbox: string; emails: EmailMessage[] }[]> {
  requireAppAuth(ctx, "searchAllMailboxes");

  const mailboxes = await getActiveMailboxes(ctx, cachedMailboxes);
  return searchMailboxes(ctx, { ...options, userIds: mailboxes });
}

/**
 * Search specific mailboxes in parallel.
 *
 * Searches the specified mailboxes simultaneously and returns results
 * grouped by mailbox. Requires app authentication.
 *
 * @param ctx - Graph client context
 * @param options - Search configuration including userIds to target
 * @returns Promise resolving to array of results grouped by mailbox (only mailboxes with results)
 *
 * @example
 * const results = await searchMailboxes(ctx, {
 *   userIds: ['chi@example.com', 'tim@example.com'],
 *   query: 'permit',
 *   limit: 10,
 *   since: new Date('2024-01-01'),
 * });
 */
export async function searchMailboxes(
  ctx: GraphClientContext,
  options: OrgSearchOptions & { userIds: string[] }
): Promise<{ mailbox: string; emails: EmailMessage[] }[]> {
  requireAppAuth(ctx, "searchMailboxes");

  const { userIds, ...searchOpts } = options;
  const limit = searchOpts.limit ?? 5;

  const results = await Promise.all(
    userIds.map(async (mailbox) => {
      try {
        const emails = await searchEmails(ctx, {
          ...searchOpts,
          limit,
          userId: mailbox,
        });
        return { emails, mailbox };
      } catch {
        return { emails: [] as EmailMessage[], mailbox };
      }
    })
  );

  return results.filter((r) => r.emails.length > 0);
}

/**
 * Search the contracts mailbox (contracts@desertservices.net).
 *
 * Requires app authentication.
 *
 * @param ctx - Graph client context
 * @param options - Search configuration
 * @returns Promise resolving to array of matching email messages
 *
 * @example
 * const results = await searchContractsMailbox(ctx, {
 *   query: 'signed agreement',
 *   limit: 20,
 * });
 */
export function searchContractsMailbox(
  ctx: GraphClientContext,
  options: OrgSearchOptions
): Promise<EmailMessage[]> {
  requireAppAuth(ctx, "searchContractsMailbox");

  return searchEmails(ctx, { ...options, userId: CONTRACTS_MAILBOX });
}

/**
 * Search estimating team mailboxes in parallel.
 *
 * Searches Jared, Jeff, Denise, and estimating@ mailboxes simultaneously.
 * Requires app authentication.
 *
 * @param ctx - Graph client context
 * @param options - Search configuration
 * @returns Promise resolving to array of results grouped by mailbox
 *
 * @example
 * const results = await searchEstimatingMailboxes(ctx, {
 *   query: 'takeoff',
 *   limit: 10,
 * });
 */
export function searchEstimatingMailboxes(
  ctx: GraphClientContext,
  options: OrgSearchOptions
): Promise<{ mailbox: string; emails: EmailMessage[] }[]> {
  requireAppAuth(ctx, "searchEstimatingMailboxes");

  return searchMailboxes(ctx, {
    ...options,
    userIds: [...ESTIMATING_MAILBOXES],
  });
}

/**
 * Filter the contracts mailbox using OData $filter syntax.
 *
 * Requires app authentication.
 *
 * @param ctx - Graph client context
 * @param options - Filter configuration
 * @returns Promise resolving to array of matching email messages
 *
 * @example
 * const withAttachments = await filterContractsMailbox(ctx, {
 *   filter: 'hasAttachments eq true',
 *   limit: 50,
 * });
 */
export function filterContractsMailbox(
  ctx: GraphClientContext,
  options: { filter: string; limit?: number }
): Promise<EmailMessage[]> {
  requireAppAuth(ctx, "filterContractsMailbox");

  return filterEmails(ctx, { ...options, userId: CONTRACTS_MAILBOX });
}

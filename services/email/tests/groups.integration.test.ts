/**
 * M365 Groups Integration Tests
 *
 * Tests the GraphGroupsClient against real Microsoft Graph API.
 * Requires AZURE_* credentials in environment.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { GraphGroupsClient } from "../groups";

// ============================================================================
// Test Configuration
// ============================================================================

const config = {
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
};

const hasCredentials = Boolean(
  config.azureTenantId && config.azureClientId && config.azureClientSecret
);

// Known group for testing
const INTERNAL_CONTRACTS_GROUP_ID = "962f9440-9bde-4178-b538-edc7f8d3ecce";

// ============================================================================
// Test Helpers
// ============================================================================

interface TimedResult<T> {
  result: T;
  ms: number;
}

async function timed<T>(
  label: string,
  fn: () => Promise<T>
): Promise<TimedResult<T>> {
  const start = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - start);
  console.log(`  [time] ${label}: ${ms}ms`);
  return { result, ms };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe.skipIf(!hasCredentials)("GraphGroupsClient integration", () => {
  let client: GraphGroupsClient;

  beforeAll(() => {
    client = new GraphGroupsClient(
      config.azureTenantId,
      config.azureClientId,
      config.azureClientSecret
    );
  });

  it("listGroups returns available groups", async () => {
    const { result: groups, ms } = await timed("listGroups", () =>
      client.listGroups()
    );

    expect(groups.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(10_000);

    // Each group should have id and displayName
    for (const group of groups) {
      expect(group.id).toBeDefined();
      expect(group.displayName).toBeDefined();
    }

    // Should include InternalContracts
    const internalContracts = groups.find((g) =>
      g.displayName.toLowerCase().includes("internalcontracts")
    );
    expect(internalContracts).toBeDefined();
    console.log(
      `  [ok] Found ${groups.length} groups, including InternalContracts`
    );
  });

  it("getGroupConversations returns conversations from InternalContracts", async () => {
    const { result: conversations, ms } = await timed(
      "getGroupConversations",
      () =>
        client.getGroupConversations(INTERNAL_CONTRACTS_GROUP_ID, { top: 10 })
    );

    expect(conversations.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(10_000);

    // Each conversation should have required fields
    for (const conv of conversations) {
      expect(conv.id).toBeDefined();
      expect(conv.topic).toBeDefined();
      expect(conv.lastDeliveredDateTime).toBeDefined();
    }

    console.log(`  [ok] Found ${conversations.length} conversations`);
  });

  it("getGroupConversations respects limit", async () => {
    const { result: conversations } = await timed(
      "getGroupConversations (limit 3)",
      () =>
        client.getGroupConversations(INTERNAL_CONTRACTS_GROUP_ID, { top: 3 })
    );

    expect(conversations.length).toBeLessThanOrEqual(3);
    console.log(
      `  [ok] Returned ${conversations.length} conversations (limit 3)`
    );
  });

  it("getFullConversation returns conversation with threads and posts", async () => {
    // First get a conversation ID
    const conversations = await client.getGroupConversations(
      INTERNAL_CONTRACTS_GROUP_ID,
      { top: 1 }
    );
    expect(conversations.length).toBeGreaterThan(0);

    const firstConv = conversations[0];
    if (!firstConv) {
      throw new Error("Expected at least one conversation");
    }
    const conversationId = firstConv.id;

    const { result: fullConv, ms } = await timed("getFullConversation", () =>
      client.getFullConversation(
        INTERNAL_CONTRACTS_GROUP_ID,
        conversationId,
        false
      )
    );

    expect(fullConv.id).toBe(conversationId);
    expect(fullConv.topic).toBeDefined();
    expect(fullConv.threads).toBeDefined();
    expect(fullConv.threads.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(15_000);

    // Check thread structure
    const thread = fullConv.threads[0];
    if (!thread) {
      throw new Error("Expected at least one thread");
    }
    expect(thread.id).toBeDefined();
    expect(thread.posts).toBeDefined();
    expect(thread.posts.length).toBeGreaterThan(0);

    // Check post structure
    const post = thread.posts[0];
    if (!post) {
      throw new Error("Expected at least one post");
    }
    expect(post.id).toBeDefined();
    expect(post.from).toBeDefined();
    expect(post.bodyContent).toBeDefined();

    console.log(
      `  [ok] Conversation "${fullConv.topic.slice(0, 40)}..." has ${fullConv.threads.length} threads`
    );
  });

  it("getConversationThreads returns threads for a conversation", async () => {
    // First get a conversation ID
    const conversations = await client.getGroupConversations(
      INTERNAL_CONTRACTS_GROUP_ID,
      { top: 1 }
    );
    const firstConv = conversations[0];
    if (!firstConv) {
      throw new Error("Expected at least one conversation");
    }

    const { result: threads, ms } = await timed("getConversationThreads", () =>
      client.getConversationThreads(INTERNAL_CONTRACTS_GROUP_ID, firstConv.id)
    );

    expect(threads.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(10_000);

    for (const thread of threads) {
      expect(thread.id).toBeDefined();
    }

    console.log(`  [ok] Found ${threads.length} threads`);
  });

  it("getThreadPosts returns posts for a thread", async () => {
    // Get a conversation and its threads
    const conversations = await client.getGroupConversations(
      INTERNAL_CONTRACTS_GROUP_ID,
      { top: 1 }
    );
    const firstConv = conversations[0];
    if (!firstConv) {
      throw new Error("Expected at least one conversation");
    }
    const threads = await client.getConversationThreads(
      INTERNAL_CONTRACTS_GROUP_ID,
      firstConv.id
    );
    const firstThread = threads[0];
    if (!firstThread) {
      throw new Error("Expected at least one thread");
    }

    const { result: posts, ms } = await timed("getThreadPosts", () =>
      client.getThreadPosts(INTERNAL_CONTRACTS_GROUP_ID, firstThread.id, false)
    );

    expect(posts.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(10_000);

    for (const post of posts) {
      expect(post.id).toBeDefined();
      expect(post.from).toBeDefined();
      expect(post.bodyContent).toBeDefined();
    }

    console.log(`  [ok] Found ${posts.length} posts in thread`);
  });
});

import { afterAll, describe, expect, test } from "bun:test";
import { N8nApi, N8nWorkflow } from "./client";

const api = new N8nApi();
const createdWorkflowIds: string[] = [];

// Helper to create unique webhook paths
const uniquePath = () =>
  `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Cleanup after all tests
afterAll(async () => {
  for (const id of createdWorkflowIds) {
    try {
      await api.deleteWorkflow(id);
    } catch {
      // ignore cleanup errors
    }
  }
});

describe("N8nWorkflow Integration", () => {
  test("creates and pushes a workflow to n8n", async () => {
    const workflow = N8nWorkflow.create(`Test-${Date.now()}`)
      .manualTrigger()
      .code("Return Hello", 'return [{ json: { message: "hello" } }]')
      .chain("Manual Trigger", "Return Hello");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);

    expect(created.id).toBeDefined();
    expect(created.name).toContain("Test-");
    expect(created.nodes).toHaveLength(2);
  });

  test("creates webhook workflow and triggers it", async () => {
    const webhookPath = `test-${Date.now()}`;

    const workflow = N8nWorkflow.create(`Webhook-Test-${Date.now()}`)
      .webhook("Webhook", { path: webhookPath, responseMode: "lastNode" })
      .code("Echo", "return [{ json: { received: $input.first().json.body } }]")
      .chain("Webhook", "Echo");

    // Create and activate
    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    // Trigger the webhook
    const result = await api.triggerWebhook<{ received: unknown }>(
      webhookPath,
      { test: "data" }
    );

    expect(result.received).toEqual({ test: "data" });
  });

  test("schedule trigger has correct interval config", async () => {
    const workflow = N8nWorkflow.create(`Schedule-Test-${Date.now()}`)
      .scheduleTrigger({ minutes: 30 })
      .code("Process", "return $input.all()");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);

    const fetched = await api.getWorkflow(created.id);
    const trigger = fetched.nodes.find((n) => n.name === "Schedule Trigger");

    expect(trigger).toBeDefined();
    expect(trigger?.parameters.rule).toEqual({
      interval: [{ field: "minutes", minutesInterval: 30 }],
    });
  });

  test("if node creates proper branching structure", async () => {
    const workflow = N8nWorkflow.create(`If-Test-${Date.now()}`)
      .manualTrigger()
      .ifNode("Check Value", {
        conditions: [
          {
            leftValue: "={{ $json.value }}",
            rightValue: 10,
            operator: { type: "number", operation: "gt" },
          },
        ],
      })
      .code("True Branch", 'return [{ json: { branch: "true" } }]')
      .code("False Branch", 'return [{ json: { branch: "false" } }]')
      .chain("Manual Trigger", "Check Value")
      .ifBranches("Check Value", "True Branch", "False Branch");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);

    const fetched = await api.getWorkflow(created.id);

    // Check if node has 2 output connections
    const ifConnections = fetched.connections["Check Value"];
    if (ifConnections?.main) {
      expect(ifConnections.main).toHaveLength(2);
      if (ifConnections.main[0]?.[0]) {
        expect(ifConnections.main[0][0].node).toBe("True Branch");
      }
      if (ifConnections.main[1]?.[0]) {
        expect(ifConnections.main[1][0].node).toBe("False Branch");
      }
    }
  });

  test("multi-step data transformation pipeline", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`Pipeline-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      // Step 1: Add a field
      .code(
        "Add Field",
        `
        const items = $input.all();
        return items.map(item => ({
          json: {
            ...item.json.body,
            processed: true,
            timestamp: Date.now()
          }
         }));
      `
      )
      // Step 2: Transform
      .code(
        "Transform",
        `
        const items = $input.all();
        return items.map(item => ({
          json: {
            result: item.json.name ? item.json.name.toUpperCase() : 'NO_NAME',
            wasProcessed: item.json.processed
          }
        }));
      `
      )
      .chain("Webhook", "Add Field", "Transform");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      result: string;
      wasProcessed: boolean;
    }>(path, { name: "test user" });

    expect(result.result).toBe("TEST USER");
    expect(result.wasProcessed).toBe(true);
  });

  test("filter node removes items", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`Filter-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      // Generate test data
      .code(
        "Generate Data",
        `
        return [
          { json: { value: 5 } },
          { json: { value: 15 } },
          { json: { value: 25 } },
          { json: { value: 8 } }
        ];
      `
      )
      // Filter to only items > 10
      .filter("Keep Big", {
        conditions: [
          {
            leftValue: "={{ $json.value }}",
            rightValue: 10,
            operator: { type: "number", operation: "gt" },
          },
        ],
      })
      // Count results
      .code(
        "Count",
        `
        return [{ json: { count: $input.all().length, values: $input.all().map(i => i.json.value) } }];
      `
      )
      .chain("Webhook", "Generate Data", "Keep Big", "Count");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      count: number;
      values: number[];
    }>(path, {});

    expect(result.count).toBe(2);
    expect(result.values).toEqual([15, 25]);
  });

  test("split out extracts array items", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`SplitOut-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      // Extract body.items first
      .code(
        "Prep",
        "return [{ json: { items: $input.first().json.body.items } }]"
      )
      .splitOut("Split Items", { field: "items" })
      .code(
        "Process Each",
        `
        return $input.all().map(item => ({
          json: { processed: item.json.name + "_done" }
        }));
      `
      )
      // Aggregate back into single response (lastNode only returns first item)
      .code(
        "Collect",
        `
        return [{ json: { results: $input.all().map(i => i.json.processed) } }];
      `
      )
      .chain("Webhook", "Prep", "Split Items", "Process Each", "Collect");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{ results: string[] }>(path, {
      items: [{ name: "a" }, { name: "b" }, { name: "c" }],
    });

    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toBe("a_done");
    expect(result.results[2]).toBe("c_done");
  });

  test("limit node restricts output", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`Limit-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .code(
        "Generate Many",
        `
        return Array.from({ length: 10 }, (_, i) => ({ json: { index: i } }));
      `
      )
      .limit("Take 3", 3)
      .code(
        "Collect",
        `
        return [{ json: { items: $input.all().map(i => i.json.index) } }];
      `
      )
      .chain("Webhook", "Generate Many", "Take 3", "Collect");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{ items: number[] }>(path, {});

    expect(result.items).toEqual([0, 1, 2]);
  });

  test("http request fetches external data", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`HTTP-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .httpRequest("Fetch JSON", {
        url: "https://httpbin.org/json",
        method: "GET",
      })
      .code(
        "Extract",
        `
        const data = $input.first().json;
        return [{ json: { hasSlideshow: !!data.slideshow } }];
      `
      )
      .chain("Webhook", "Fetch JSON", "Extract");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{ hasSlideshow: boolean }>(
      path,
      {}
    );

    expect(result.hasSlideshow).toBe(true);
  });

  test("if node routes to correct branch based on input", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`IfRoute-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .code("Prep", "return [{ json: $input.first().json.body }]")
      .ifNode("Check Type", {
        conditions: [
          {
            leftValue: "={{ $json.type }}",
            rightValue: "premium",
            operator: { type: "string", operation: "equals" },
          },
        ],
      })
      .code(
        "Premium Path",
        'return [{ json: { tier: "premium", discount: 20 } }]'
      )
      .code("Basic Path", 'return [{ json: { tier: "basic", discount: 0 } }]')
      .chain("Webhook", "Prep", "Check Type")
      .ifBranches("Check Type", "Premium Path", "Basic Path");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    // Test premium path
    const premium = await api.triggerWebhook<{
      tier: string;
      discount: number;
    }>(path, { type: "premium" });
    expect(premium.tier).toBe("premium");
    expect(premium.discount).toBe(20);

    // Test basic path
    const basic = await api.triggerWebhook<{ tier: string; discount: number }>(
      path,
      { type: "basic" }
    );
    expect(basic.tier).toBe("basic");
    expect(basic.discount).toBe(0);
  });

  test("complex workflow: fetch, filter, transform, aggregate", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`Complex-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      // Simulate fetching a list of users
      .code(
        "Mock Users",
        `
        return [
          { json: { id: 1, name: "Alice", age: 30, department: "Engineering" } },
          { json: { id: 2, name: "Bob", age: 25, department: "Sales" } },
          { json: { id: 3, name: "Charlie", age: 35, department: "Engineering" } },
          { json: { id: 4, name: "Diana", age: 28, department: "Marketing" } },
          { json: { id: 5, name: "Eve", age: 32, department: "Engineering" } }
        ];
      `
      )
      // Filter to Engineering only
      .filter("Engineering Only", {
        conditions: [
          {
            leftValue: "={{ $json.department }}",
            rightValue: "Engineering",
            operator: { type: "string", operation: "equals" },
          },
        ],
      })
      // Transform: extract just name and age
      .code(
        "Transform",
        `
        return $input.all().map(item => ({
          json: { name: item.json.name, age: item.json.age }
        }));
      `
      )
      // Aggregate: compute average age
      .code(
        "Aggregate",
        `
        const items = $input.all();
        const totalAge = items.reduce((sum, i) => sum + i.json.age, 0);
        const avgAge = totalAge / items.length;
        return [{
          json: {
            department: "Engineering",
            count: items.length,
            averageAge: avgAge,
            members: items.map(i => i.json.name)
          }
        }];
      `
      )
      .chain(
        "Webhook",
        "Mock Users",
        "Engineering Only",
        "Transform",
        "Aggregate"
      );

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      department: string;
      count: number;
      averageAge: number;
      members: string[];
    }>(path, {});

    expect(result.department).toBe("Engineering");
    expect(result.count).toBe(3);
    expect(result.averageAge).toBeCloseTo(32.33, 1);
    expect(result.members).toEqual(["Alice", "Charlie", "Eve"]);
  });

  // ============================================================================
  // Monday.com Native Node Tests
  // ============================================================================

  test("monday node fetches items from board", async () => {
    const path = uniquePath();
    const ESTIMATING_BOARD = "7943937851";
    const ESTIMATING_GROUP = "group_mkt5fv3a"; // Required for Monday node to work

    const workflow = N8nWorkflow.create(`Monday-Get-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .mondayGetItems("Get Estimates", {
        boardId: ESTIMATING_BOARD,
        groupId: ESTIMATING_GROUP,
        limit: 3,
      })
      .code(
        "Summarize",
        `
        const items = $input.all();
        return [{
          json: {
            count: items.length,
            hasItems: items.length > 0,
            firstItemName: items[0]?.json?.name || null
          }
        }];
      `
      )
      .chain("Webhook", "Get Estimates", "Summarize");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      count: number;
      hasItems: boolean;
      firstItemName: string | null;
    }>(path, {});

    expect(result.hasItems).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(result.count).toBeLessThanOrEqual(3);
  });

  test("monday node gets all boards", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`Monday-Boards-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .mondayGetBoards("Get Boards", { limit: 10 })
      .code(
        "Summarize",
        `
        const boards = $input.all();
        return [{
          json: {
            count: boards.length,
            hasBoards: boards.length > 0,
            boardNames: boards.slice(0, 3).map(b => b.json.name)
          }
        }];
      `
      )
      .chain("Webhook", "Get Boards", "Summarize");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      count: number;
      hasBoards: boolean;
      boardNames: string[];
    }>(path, {});

    expect(result.hasBoards).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });

  test("monday node gets groups from board", async () => {
    const path = uniquePath();
    const ESTIMATING_BOARD = "7943937851";

    const workflow = N8nWorkflow.create(`Monday-Groups-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .mondayGetGroups("Get Groups", { boardId: ESTIMATING_BOARD })
      .code(
        "Summarize",
        `
        const groups = $input.all();
        return [{
          json: {
            count: groups.length,
            hasGroups: groups.length > 0,
            groupIds: groups.map(g => g.json.id)
          }
        }];
      `
      )
      .chain("Webhook", "Get Groups", "Summarize");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      count: number;
      hasGroups: boolean;
      groupIds: string[];
    }>(path, {});

    expect(result.hasGroups).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    // Should contain the known group we've been using
    expect(result.groupIds).toContain("group_mkt5fv3a");
  });

  test(
    "monday node full lifecycle: create, get, delete item",
    async () => {
      const path = uniquePath();
      const ESTIMATING_BOARD = "7943937851";
      const ESTIMATING_GROUP = "group_mkt5fv3a";
      const testItemName = `Test-n8n-${Date.now()}`;

      // Create item workflow
      const createWorkflow = N8nWorkflow.create(`Monday-Create-${Date.now()}`)
        .webhook("Webhook", { path, responseMode: "lastNode" })
        .mondayCreateItem("Create Item", {
          boardId: ESTIMATING_BOARD,
          groupId: ESTIMATING_GROUP,
          name: testItemName,
        })
        .code(
          "Return ID",
          `
        const item = $input.first().json;
        return [{ json: { id: item.id } }];
      `
        )
        .chain("Webhook", "Create Item", "Return ID");

      const created = await api.createWorkflow(createWorkflow);
      createdWorkflowIds.push(created.id);
      await api.activateWorkflow(created.id);

      // Create the item - Monday only returns the ID on create
      const createResult = await api.triggerWebhook<{ id: string }>(path, {});
      expect(createResult.id).toBeDefined();
      expect(typeof createResult.id).toBe("string");

      // Verify by getting the item
      const getPath = uniquePath();
      const getWorkflow = N8nWorkflow.create(`Monday-Get-${Date.now()}`)
        .webhook("Webhook", { path: getPath, responseMode: "lastNode" })
        .mondayGetItem("Get Item", { itemId: createResult.id })
        .code(
          "Extract",
          `
        const item = $input.first().json;
        return [{ json: { id: item.id, name: item.name } }];
      `
        )
        .chain("Webhook", "Get Item", "Extract");

      const getCreated = await api.createWorkflow(getWorkflow);
      createdWorkflowIds.push(getCreated.id);
      await api.activateWorkflow(getCreated.id);

      const getResult = await api.triggerWebhook<{ id: string; name: string }>(
        getPath,
        {}
      );
      expect(getResult.id).toBe(createResult.id);
      expect(getResult.name).toBe(testItemName);

      // Clean up - delete the test item
      const deletePath = uniquePath();
      const deleteWorkflow = N8nWorkflow.create(`Monday-Delete-${Date.now()}`)
        .webhook("Webhook", { path: deletePath, responseMode: "lastNode" })
        .mondayDeleteItem("Delete Item", { itemId: createResult.id })
        .code("Confirm", "return [{ json: { deleted: true } }];")
        .chain("Webhook", "Delete Item", "Confirm");

      const deleteCreated = await api.createWorkflow(deleteWorkflow);
      createdWorkflowIds.push(deleteCreated.id);
      await api.activateWorkflow(deleteCreated.id);

      const deleteResult = await api.triggerWebhook<{ deleted: boolean }>(
        deletePath,
        {}
      );
      expect(deleteResult.deleted).toBe(true);
    },
    { timeout: 15_000 }
  );

  // ============================================================================
  // Notion Native Node Tests
  // ============================================================================

  test("notion node queries database", async () => {
    const path = uniquePath();
    // Contacts database - accessible to n8n's Notion integration
    const CONTACTS_DB = "2a7c1835-5bb2-8034-a07c-d34bc174072d";

    const workflow = N8nWorkflow.create(`Notion-Query-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .notionGetAll("Get Contacts", {
        database: { id: CONTACTS_DB, name: "Contacts" },
        limit: 5,
      })
      .code(
        "Summarize",
        `
        const pages = $input.all();
        return [{
          json: {
            count: pages.length,
            hasPages: pages.length > 0,
            firstPageId: pages[0]?.json?.id || null
          }
        }];
      `
      )
      .chain("Webhook", "Get Contacts", "Summarize");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      count: number;
      hasPages: boolean;
      firstPageId: string | null;
    }>(path, {});

    expect(result.hasPages).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(result.count).toBeLessThanOrEqual(5);
  });

  test("notion node with filter", async () => {
    const path = uniquePath();
    const CONTACTS_DB = "2a7c1835-5bb2-8034-a07c-d34bc174072d";

    const workflow = N8nWorkflow.create(`Notion-Filter-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .notionGetAll("Get Contacts", {
        database: { id: CONTACTS_DB, name: "Contacts" },
        limit: 10,
        filters: [
          {
            key: "Name|title", // n8n requires property type suffix
            condition: "is_not_empty",
          },
        ],
      })
      .code(
        "Count",
        `
        return [{ json: { count: $input.all().length } }];
      `
      )
      .chain("Webhook", "Get Contacts", "Count");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{ count: number }>(path, {});

    // Should only get companies with names
    expect(result.count).toBeGreaterThan(0);
  });

  // ============================================================================
  // HTTP with Credentials Tests
  // ============================================================================

  test("http request with SharePoint credential", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`HTTP-SharePoint-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .httpRequest("Get SharePoint Site", {
        // Use SharePoint REST API (not Graph API)
        url: "https://desertservices.sharepoint.com/sites/DataDrive/_api/web",
        method: "GET",
        credential: "sharepoint",
        headers: { Accept: "application/json;odata=verbose" },
      })
      .code(
        "Extract",
        `
        const site = $input.first().json;
        return [{
          json: {
            title: site.d?.Title || null,
            hasData: !!site.d
          }
        }];
      `
      )
      .chain("Webhook", "Get SharePoint Site", "Extract");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      title: string | null;
      hasData: boolean;
    }>(path, {});

    expect(result.hasData).toBe(true);
    expect(result.title).toBe("DataDrive");
  });

  test("outlook node gets messages", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`Outlook-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .outlookGetMessages("Get Messages", { limit: 3, fields: ["from"] })
      .code(
        "Summarize",
        `
        const messages = $input.all();
        return [{
          json: {
            count: messages.length,
            hasMessages: messages.length > 0
          }
        }];
      `
      )
      .chain("Webhook", "Get Messages", "Summarize");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      count: number;
      hasMessages: boolean;
    }>(path, {});

    expect(result.count).toBeGreaterThan(0);
    expect(result.hasMessages).toBe(true);
  });

  test("outlook node gets mail folders", async () => {
    const path = uniquePath();

    const workflow = N8nWorkflow.create(`Outlook-Folders-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .outlookGetFolders("Get Folders", { limit: 10 })
      .code(
        "Summarize",
        `
        const folders = $input.all();
        return [{
          json: {
            count: folders.length,
            hasFolders: folders.length > 0,
            folderNames: folders.slice(0, 5).map(f => f.json.displayName)
          }
        }];
      `
      )
      .chain("Webhook", "Get Folders", "Summarize");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      count: number;
      hasFolders: boolean;
      folderNames: string[];
    }>(path, {});

    expect(result.hasFolders).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    // Common folders should exist
    expect(result.folderNames.some((n) => n.includes("Inbox"))).toBe(true);
  });

  // ============================================================================
  // Additional Monday.com Tests
  // ============================================================================

  test("monday node gets board columns/schema", async () => {
    const path = uniquePath();
    const ESTIMATING_BOARD = "7943937851";

    const workflow = N8nWorkflow.create(`Monday-Columns-${Date.now()}`)
      .webhook("Webhook", { path, responseMode: "lastNode" })
      .mondayGetColumns("Get Columns", { boardId: ESTIMATING_BOARD })
      .code(
        "Summarize",
        `
        const columns = $input.all();
        return [{
          json: {
            count: columns.length,
            hasColumns: columns.length > 0,
            columnTypes: columns.map(c => c.json.type)
          }
        }];
      `
      )
      .chain("Webhook", "Get Columns", "Summarize");

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);
    await api.activateWorkflow(created.id);

    const result = await api.triggerWebhook<{
      count: number;
      hasColumns: boolean;
      columnTypes: string[];
    }>(path, {});

    expect(result.hasColumns).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });

  // ============================================================================
  // Additional Notion Tests
  // ============================================================================

  test(
    "notion node gets single page by ID",
    async () => {
      const path = uniquePath();
      // Use a known page ID from the Contacts database
      const CONTACTS_DB = "2a7c1835-5bb2-8034-a07c-d34bc174072d";

      // First, get a page ID from the database
      const listPath = uniquePath();
      const listWorkflow = N8nWorkflow.create(`Notion-List-${Date.now()}`)
        .webhook("Webhook", { path: listPath, responseMode: "lastNode" })
        .notionGetAll("Get Contacts", {
          database: { id: CONTACTS_DB, name: "Contacts" },
          limit: 1,
        })
        .code(
          "Extract ID",
          `
        const page = $input.first().json;
        return [{ json: { pageId: page.id } }];
      `
        )
        .chain("Webhook", "Get Contacts", "Extract ID");

      const listCreated = await api.createWorkflow(listWorkflow);
      createdWorkflowIds.push(listCreated.id);
      await api.activateWorkflow(listCreated.id);

      const listResult = await api.triggerWebhook<{ pageId: string }>(
        listPath,
        {}
      );
      const pageId = listResult.pageId;

      // Now test getPage with that ID
      const workflow = N8nWorkflow.create(`Notion-GetPage-${Date.now()}`)
        .webhook("Webhook", { path, responseMode: "lastNode" })
        .notionGetPage("Get Page", { pageId })
        .code(
          "Extract",
          `
        const page = $input.first().json;
        return [{
          json: {
            id: page.id,
            hasUrl: !!page.url,
            hasName: !!page.name
          }
        }];
      `
        )
        .chain("Webhook", "Get Page", "Extract");

      const created = await api.createWorkflow(workflow);
      createdWorkflowIds.push(created.id);
      await api.activateWorkflow(created.id);

      const result = await api.triggerWebhook<{
        id: string;
        hasUrl: boolean;
        hasName: boolean;
      }>(path, {});

      expect(result.id).toBe(pageId);
      expect(result.hasUrl).toBe(true);
      expect(result.hasName).toBe(true);
    },
    { timeout: 15_000 }
  );

  // ============================================================================
  // File Operations Tests
  // ============================================================================

  test("convertToFile node has correct structure", async () => {
    // Test that the convertToFile node builds with the right parameters
    const workflow = N8nWorkflow.create(`ConvertToFile-${Date.now()}`)
      .manualTrigger()
      .code("Generate Data", 'return [{ json: { name: "Test" } }]')
      .convertToFile("To Excel", {
        fileFormat: "xlsx",
        fileName: "employees.xlsx",
      });

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);

    const fetched = await api.getWorkflow(created.id);
    const excelNode = fetched.nodes.find((n) => n.name === "To Excel");

    expect(excelNode).toBeDefined();
    expect(excelNode?.type).toBe("n8n-nodes-base.convertToFile");
    expect(excelNode?.parameters.operation).toBe("toFile");
    expect(excelNode?.parameters.fileFormat).toBe("xlsx");
    expect(excelNode?.parameters.binaryPropertyName).toBe("data");
  });

  test("extractFromFile node has correct structure", async () => {
    // Test that the extractFromFile node builds with the right parameters
    const workflow = N8nWorkflow.create(`ExtractFromFile-${Date.now()}`)
      .manualTrigger()
      .extractFromFile("Parse Excel", { sheetName: "Sheet1" });

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);

    const fetched = await api.getWorkflow(created.id);
    const parseNode = fetched.nodes.find((n) => n.name === "Parse Excel");

    expect(parseNode).toBeDefined();
    expect(parseNode?.type).toBe("n8n-nodes-base.extractFromFile");
    expect(parseNode?.parameters.operation).toBe("fromFile");
    expect(parseNode?.parameters.binaryPropertyName).toBe("data");
  });

  test("pdfExtract node has correct structure", async () => {
    // Test that the pdfExtract node builds with the right parameters
    const workflow = N8nWorkflow.create(`PDF-Extract-${Date.now()}`)
      .manualTrigger()
      .pdfExtract("Extract PDF Text", { maxPages: 5 });

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);

    const fetched = await api.getWorkflow(created.id);
    const pdfNode = fetched.nodes.find((n) => n.name === "Extract PDF Text");

    expect(pdfNode).toBeDefined();
    expect(pdfNode?.parameters.operation).toBe("pdf");
    expect(pdfNode?.parameters.binaryPropertyName).toBe("data");
    expect(
      (pdfNode?.parameters.options as { maxPages?: number })?.maxPages
    ).toBe(5);
  });

  test("sharePointUploadFile node has correct structure", async () => {
    const workflow = N8nWorkflow.create(`SP-Upload-${Date.now()}`)
      .manualTrigger()
      .sharePointUploadFile("Upload File", {
        site: { id: "site-id-123", name: "DataDrive" },
        folderId: "folder-id-456",
        fileName: "report.xlsx",
      });

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);

    const fetched = await api.getWorkflow(created.id);
    const uploadNode = fetched.nodes.find((n) => n.name === "Upload File");

    expect(uploadNode).toBeDefined();
    expect(uploadNode?.parameters.operation).toBe("upload");
    expect(uploadNode?.parameters.fileName).toBe("report.xlsx");
    expect(uploadNode?.parameters.binaryPropertyName).toBe("data");
    expect(uploadNode?.type).toBe("n8n-nodes-base.microsoftSharePoint");
  });

  test("sharePointDownloadFile node has correct structure", async () => {
    const workflow = N8nWorkflow.create(`SP-Download-${Date.now()}`)
      .manualTrigger()
      .sharePointDownloadFile("Download File", {
        site: { id: "site-id-123", name: "DataDrive" },
        fileId: "file-id-789",
      });

    const created = await api.createWorkflow(workflow);
    createdWorkflowIds.push(created.id);

    const fetched = await api.getWorkflow(created.id);
    const downloadNode = fetched.nodes.find((n) => n.name === "Download File");

    expect(downloadNode).toBeDefined();
    expect(downloadNode?.parameters.operation).toBe("download");
    expect(downloadNode?.type).toBe("n8n-nodes-base.microsoftSharePoint");
  });

  // ============================================================================
  // SharePoint Excel → Monday Integration Tests
  // ============================================================================

  test(
    "sharepoint excel pipeline: workflow structure and connections",
    async () => {
      // SharePoint DataDrive site
      const SITE_ID =
        "desertservices.sharepoint.com,868802f7-24a1-442c-a2d9-f1cebf329439,af4cba2f-a9f2-447d-9036-41102d09ce07";
      // SWPPP Master 11-7-24.xlsx
      const FILE_ID = "01J5LMOW6ZZM3IEAIWQVFYCABQJSB4LX42";

      const workflow = N8nWorkflow.create(`Excel-Pipeline-${Date.now()}`)
        .manualTrigger()
        // Download the Excel file from SharePoint
        .sharePointDownloadFile("Download Excel", {
          site: { id: SITE_ID, name: "DataDrive" },
          fileId: FILE_ID,
        })
        // Parse Excel to JSON rows
        .extractFromFile("Parse Excel", { binaryPropertyName: "data" })
        // Summarize for response
        .code(
          "Summarize",
          `
          const rows = $input.all();
          const columnNames = rows.length > 0 ? Object.keys(rows[0].json) : [];
          return [{
            json: {
              rowCount: rows.length,
              hasData: rows.length > 0,
              columns: columnNames,
              sampleRow: rows[0]?.json || null
            }
          }];
        `
        )
        .chain("Manual Trigger", "Download Excel", "Parse Excel", "Summarize");

      const created = await api.createWorkflow(workflow);
      createdWorkflowIds.push(created.id);

      // Verify workflow structure
      expect(created.nodes).toHaveLength(4);

      // Verify SharePoint download node
      const downloadNode = created.nodes.find(
        (n) => n.name === "Download Excel"
      );
      expect(downloadNode?.type).toBe("n8n-nodes-base.microsoftSharePoint");
      expect(downloadNode?.parameters.operation).toBe("download");
      expect(downloadNode?.parameters.fileId).toEqual({
        __rl: true,
        value: FILE_ID,
        mode: "id",
      });

      // Verify Extract node
      const extractNode = created.nodes.find((n) => n.name === "Parse Excel");
      expect(extractNode?.type).toBe("n8n-nodes-base.extractFromFile");

      // Verify connections
      const fetched = await api.getWorkflow(created.id);
      expect(fetched.connections["Manual Trigger"]?.main?.[0]?.[0]?.node).toBe(
        "Download Excel"
      );
      expect(fetched.connections["Download Excel"]?.main?.[0]?.[0]?.node).toBe(
        "Parse Excel"
      );
      expect(fetched.connections["Parse Excel"]?.main?.[0]?.[0]?.node).toBe(
        "Summarize"
      );
    },
    { timeout: 15_000 }
  );

  test(
    "sharepoint excel → monday kpi board workflow structure",
    async () => {
      // SharePoint DataDrive site
      const SITE_ID =
        "desertservices.sharepoint.com,868802f7-24a1-442c-a2d9-f1cebf329439,af4cba2f-a9f2-447d-9036-41102d09ce07";
      // SWPPP Master Excel
      const FILE_ID = "01J5LMOW6ZZM3IEAIWQVFYCABQJSB4LX42";
      // KPI Board for SWPPP Lead Time
      const KPI_BOARD_ID = "18393149717";
      const KPI_GROUP = "topics"; // Default group

      const workflow = N8nWorkflow.create(`Excel-KPI-${Date.now()}`)
        // Step 1: Download Excel from SharePoint
        .sharePointDownloadFile("Download Excel", {
          site: { id: SITE_ID, name: "DataDrive" },
          fileId: FILE_ID,
        })
        // Step 2: Extract/parse Excel to JSON rows
        .extractFromFile("Parse Excel", {
          binaryPropertyName: "data",
        })
        // Step 3: Transform data for Monday (limit to first row for test)
        .limit("Take First", 1)
        .code(
          "Transform for Monday",
          `
          const row = $input.first().json;
          // Map Excel columns to Monday item format
          // Using first available text field as name
          const keys = Object.keys(row);
          const name = row[keys[0]] || 'Unknown Project';
          return [{
            json: {
              itemName: String(name).slice(0, 100),
              boardId: '${KPI_BOARD_ID}',
              groupId: '${KPI_GROUP}'
            }
          }];
        `
        )
        // Chain nodes
        .chain(
          "Download Excel",
          "Parse Excel",
          "Take First",
          "Transform for Monday"
        );

      // Verify workflow structure is correct
      const created = await api.createWorkflow(workflow);
      createdWorkflowIds.push(created.id);

      // Check we have all 4 nodes
      expect(created.nodes).toHaveLength(4);

      // Verify SharePoint download node
      const downloadNode = created.nodes.find(
        (n) => n.name === "Download Excel"
      );
      expect(downloadNode).toBeDefined();
      expect(downloadNode?.type).toBe("n8n-nodes-base.microsoftSharePoint");
      expect(downloadNode?.parameters.operation).toBe("download");
      expect(downloadNode?.parameters.fileId).toEqual({
        __rl: true,
        value: FILE_ID,
        mode: "id",
      });

      // Verify Extract node
      const extractNode = created.nodes.find((n) => n.name === "Parse Excel");
      expect(extractNode).toBeDefined();
      expect(extractNode?.type).toBe("n8n-nodes-base.extractFromFile");

      // Verify connections
      const fetched = await api.getWorkflow(created.id);
      expect(fetched.connections["Download Excel"]?.main?.[0]?.[0]?.node).toBe(
        "Parse Excel"
      );
      expect(fetched.connections["Parse Excel"]?.main?.[0]?.[0]?.node).toBe(
        "Take First"
      );
      expect(fetched.connections["Take First"]?.main?.[0]?.[0]?.node).toBe(
        "Transform for Monday"
      );
    },
    { timeout: 15_000 }
  );
});

import { afterEach, describe, expect, test } from "bun:test";
import { AQDataClient } from "../../../apps/aqdata-worker/src/aqdata/client";
import { FORMS } from "../../../apps/aqdata-worker/src/aqdata/constants";

class TestAQDataClient extends AQDataClient {
  capturedFields: Record<string, string | string[]> | null = null;

  constructor() {
    super();
    this.state = "on_page";
    this.currentFormName = FORMS.dustApplications.formName;
    this.currentFormAction = "/applications/dustApplicationSearch.jsf";
    this.stateToken = 1;
  }

  protected override postCurrentForm(
    extraFields: Record<string, string | string[]>
  ): Promise<string> {
    this.capturedFields = extraFields;
    return Promise.resolve("<html></html>");
  }
}

describe("AQDataClient.searchDustApplications", () => {
  afterEach(() => {
    // Keep environment deterministic if other tests enable debug logs.
    process.env.AQ_DEBUG = undefined;
  });

  test("defaults broad search to all statuses", async () => {
    const client = new TestAQDataClient();
    await client.searchDustApplications({});

    const statuses =
      client.capturedFields?.[FORMS.dustApplications.statusField];
    expect(statuses).toEqual(["0", "1", "2", "3", "4"]);
  });

  test("defaults direct ID search to Active status only", async () => {
    const client = new TestAQDataClient();
    await client.searchDustApplications({ applicationId: "D0059617" });

    const statuses =
      client.capturedFields?.[FORMS.dustApplications.statusField];
    expect(statuses).toEqual(["0"]);
  });

  test("uses explicit statuses when provided", async () => {
    const client = new TestAQDataClient();
    await client.searchDustApplications({
      statuses: ["Closed", "Rejected"],
    });

    const statuses =
      client.capturedFields?.[FORMS.dustApplications.statusField];
    expect(statuses).toEqual(["1", "2"]);
  });
});

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  TriageContext,
  TriageResult,
} from "@/packages/archive/email/sync/triage/types";

interface MockRerankState {
  calls: Array<{
    documents: string[];
    options: Record<string, unknown>;
    query: string;
  }>;
  queue: { index: number; relevance_score: number }[][];
  throwOnCall: number | null;
}

const rerankState: MockRerankState = {
  calls: [],
  queue: [],
  throwOnCall: null,
};

mock.module("@enrichment/jina/client", () => ({
  rerank: (
    query: string,
    documents: string[],
    options: Record<string, unknown>
  ) => {
    rerankState.calls.push({ query, documents, options });
    if (
      rerankState.throwOnCall !== null &&
      rerankState.calls.length === rerankState.throwOnCall
    ) {
      throw new Error("rerank failure");
    }
    const results = rerankState.queue.shift() ?? [];
    return {
      model: String(options.model ?? ""),
      results,
    };
  },
}));

const { evaluateTriageRerankShadow, rerankProjectCandidates } = await import(
  "@/packages/archive/email/sync/triage/rerank-shadow"
);

function buildContext(): TriageContext {
  return {
    email: {
      id: 7,
      subject: "Ironwood Site contract follow-up",
      body: "Please review contract draft and estimate details",
      from: "PM <pm@builder.example.com>",
      fromDomain: "builder.example.com",
      to: ["ops@desertservices.net"],
      cc: [],
      mailbox: "ops@desertservices.net",
      receivedAt: "2026-02-20T10:00:00.000Z",
      attachmentNames: [],
      isForwarded: false,
      originalSender: null,
      isPlatformEmail: false,
      platformName: null,
      categories: [],
      existingClassification: null,
      existingProjectId: null,
    },
    thread: [
      {
        from: "Estimator <est@builder.example.com>",
        subject: "RE: Ironwood Site estimate",
        bodyPreview: null,
        receivedAt: "2026-02-19T09:00:00.000Z",
        projectId: null,
        classification: null,
      },
    ],
    documents: [],
    attachments: [],
    candidates: {
      projects: [
        {
          id: 10,
          name: "Ironwood Site",
          contractor: "Builder Co",
          address: "123 Main St",
          lifecycleState: "active",
          score: 300,
        },
        {
          id: 20,
          name: "North Yard",
          contractor: "Builder Co",
          address: "999 North Rd",
          lifecycleState: "active",
          score: 250,
        },
      ],
      estimates: [
        {
          id: 100,
          estimateNumber: "7654321",
          jobName: "Ironwood Site",
          contractor: "Builder Co",
          jobAddress: "123 Main St",
          projectId: 10,
          score: 200,
        },
        {
          id: 200,
          estimateNumber: "8888888",
          jobName: "North Yard",
          contractor: "Builder Co",
          jobAddress: "999 North Rd",
          projectId: 20,
          score: 150,
        },
      ],
    },
  };
}

describe("evaluateTriageRerankShadow", () => {
  beforeEach(() => {
    rerankState.calls = [];
    rerankState.queue = [];
    rerankState.throwOnCall = null;
  });

  test("skips reranking when mode is disabled", async () => {
    await evaluateTriageRerankShadow(
      {
        context: buildContext(),
        emailId: 7,
        llmResult: null,
      },
      {
        mode: "disabled",
        topN: 2,
      }
    );

    expect(rerankState.calls).toHaveLength(0);
  });

  test("reranks project candidates in shadow mode and logs evaluation", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };

    try {
      rerankState.queue = [
        [
          { index: 1, relevance_score: 0.99 },
          { index: 0, relevance_score: 0.91 },
        ],
      ];

      const llmResult: TriageResult = {
        category: "CONTRACT",
        subcategory: "new_contract",
        projectId: 20,
        estimateId: 100,
        confidence: 0.85,
        reason: "test",
      };

      await evaluateTriageRerankShadow(
        {
          context: buildContext(),
          emailId: 7,
          llmResult,
        },
        {
          mode: "shadow",
          topN: 2,
        }
      );
    } finally {
      console.log = originalLog;
    }

    expect(rerankState.calls).toHaveLength(1);

    const [projectCall] = rerankState.calls;
    expect(projectCall?.options.model).toBe("jina-reranker-v3");
    expect(projectCall?.documents).toHaveLength(2);

    const projectLog = logs.find((line) => line.includes("kind=project"));

    expect(projectLog).toContain("baselineTop=10,20");
    expect(projectLog).toContain("rerankTop=20,10");
    expect(projectLog).toContain("llmPicked=20");
  });

  test("logs warning and continues when rerank fails for one candidate kind", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((arg) => String(arg)).join(" "));
    };

    try {
      rerankState.throwOnCall = 1;
      rerankState.queue = [[{ index: 0, relevance_score: 0.9 }]];

      await evaluateTriageRerankShadow(
        {
          context: buildContext(),
          emailId: 7,
          llmResult: null,
        },
        {
          mode: "shadow",
          topN: 2,
        }
      );
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings.some((line) => line.includes("kind=project failed"))).toBe(
      true
    );
    expect(rerankState.calls).toHaveLength(1);
  });

  test("reranks project candidate order in project mode", async () => {
    rerankState.queue = [
      [
        { index: 1, relevance_score: 0.99 },
        { index: 0, relevance_score: 0.91 },
      ],
    ];

    const context = buildContext();
    const reranked = await rerankProjectCandidates(
      {
        context,
        emailId: 7,
      },
      {
        mode: "project",
      }
    );

    expect(rerankState.calls).toHaveLength(1);
    expect(reranked.map((candidate) => candidate.id)).toEqual([20, 10]);
  });

  test("keeps baseline project order when rerank mode is disabled", async () => {
    const context = buildContext();
    const reranked = await rerankProjectCandidates(
      {
        context,
        emailId: 7,
      },
      {
        mode: "disabled",
      }
    );

    expect(rerankState.calls).toHaveLength(0);
    expect(reranked.map((candidate) => candidate.id)).toEqual([10, 20]);
  });
});

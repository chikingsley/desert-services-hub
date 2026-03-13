import { check, fail } from "k6";
import http from "k6/http";

const apiUrl = (__ENV.TRIGGER_API_URL || "http://localhost:8030").replace(
  /\/$/,
  ""
);
const secretKey = __ENV.TRIGGER_SECRET_KEY || "";
const taskId = __ENV.TASK_ID || "load-test-db-ping";
const holdMs = Number.parseInt(__ENV.HOLD_MS || "250", 10);
const rate = Number.parseInt(__ENV.RATE || "2", 10);
const duration = __ENV.DURATION || "30s";
const preAllocatedVUs = Number.parseInt(__ENV.PREALLOCATED_VUS || "8", 10);
const maxVUs = Number.parseInt(__ENV.MAX_VUS || "32", 10);
const rawTaskPayload = __ENV.TASK_PAYLOAD_JSON || "";
const httpP95ThresholdMs = Number.parseInt(
  __ENV.HTTP_P95_THRESHOLD_MS || "1500",
  10
);

let taskPayloadOverride = null;
if (rawTaskPayload) {
  try {
    taskPayloadOverride = JSON.parse(rawTaskPayload);
  } catch {
    fail("TASK_PAYLOAD_JSON must be valid JSON.");
  }
}

if (!secretKey) {
  fail("TRIGGER_SECRET_KEY is required.");
}

if (!taskId) {
  fail("TASK_ID is required.");
}

export const options = {
  scenarios: {
    trigger_load: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration,
      preAllocatedVUs,
      maxVUs,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: [`p(95)<${httpP95ThresholdMs}`],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const taskPayload = taskPayloadOverride ?? {
    holdMs,
    label: `k6-vu${__VU}-iter${__ITER}`,
  };

  const payload = JSON.stringify({
    payload: taskPayload,
    options: {},
  });

  const response = http.post(
    `${apiUrl}/api/v1/tasks/${taskId}/trigger`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      timeout: "10s",
    }
  );

  const accepted =
    response.status === 200 ||
    response.status === 201 ||
    response.status === 202;

  const checkResult = check(response, {
    "trigger accepted": () => accepted,
    "response has run id": () => {
      if (!accepted) {
        return true;
      }

      let parsed;
      try {
        parsed = JSON.parse(response.body || "{}");
      } catch {
        return false;
      }

      return Boolean(
        parsed.id ||
          parsed.runId ||
          parsed.handle ||
          parsed.run?.id ||
          parsed.taskRun?.id
      );
    },
  });

  if (!(accepted && checkResult)) {
    const body =
      typeof response.body === "string" ? response.body.slice(0, 240) : "";
    console.error(
      `trigger request failed status=${response.status} body=${body}`
    );
  }
}

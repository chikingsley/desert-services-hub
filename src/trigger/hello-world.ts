import { task } from "@trigger.dev/sdk";

export const helloWorld = task({
  id: "hello-world",
  run: (payload: { message: string }) => {
    console.log(`Hello from Trigger.dev: ${payload.message}`);
    return {
      ok: true,
      received: payload.message,
      timestamp: new Date().toISOString(),
    };
  },
});

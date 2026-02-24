import { serve } from "bun";
import {
  handleBuildingConnectedAuthClipboardCopy,
  handleBuildingConnectedAuthClipboardPaste,
  handleBuildingConnectedAuthStart,
  handleBuildingConnectedAuthStatus,
  handleBuildingConnectedAuthStop,
} from "./api/auth";
import { handleBuildingConnectedDownload } from "./api/download";
import { bcSession } from "./lib/browser";

const PORT = Number(process.env.PORT) || 47_824;

serve({
  hostname: "0.0.0.0",
  port: PORT,
  routes: {
    "/health": {
      GET() {
        return Response.json({
          ok: true,
          service: "bc-worker",
          timestamp: new Date().toISOString(),
        });
      },
    },
    "/api/buildingconnected/auth/status": {
      GET: handleBuildingConnectedAuthStatus,
    },
    "/api/buildingconnected/auth/start": {
      POST: ((req: Request) => handleBuildingConnectedAuthStart(req)) as never,
    },
    "/api/buildingconnected/auth/stop": {
      POST: handleBuildingConnectedAuthStop,
    },
    "/api/buildingconnected/auth/clipboard/paste": {
      POST: ((req: Request) =>
        handleBuildingConnectedAuthClipboardPaste(req)) as never,
    },
    "/api/buildingconnected/auth/clipboard/copy": {
      POST: handleBuildingConnectedAuthClipboardCopy,
    },
    "/api/buildingconnected/download": {
      POST: ((req: Request) => handleBuildingConnectedDownload(req)) as never,
    },
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
  error(error) {
    console.error("[bc-worker] unhandled error:", error);
    return Response.json(
      { error: "Internal Server Error", success: false },
      { status: 500 }
    );
  },
});

console.log(`BC Worker API running on http://localhost:${PORT}`);

// Auto-start browser session — loads storageState if available
bcSession.getOrCreateSession().catch((error) => {
  console.error("[bc-worker] Failed to auto-start session:", error);
});

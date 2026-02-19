import { serve } from "bun";
import {
  handleScrapePermit,
  handleScrapeRun,
  handleScrapeStart,
  handleScrapeStatus,
  handleScrapeStop,
} from "./api/scrape";
import { handleCompanySync, handleSync } from "./api/sync";

const PORT = Number(process.env.PORT) || 47_823;
const IDLE_TIMEOUT_SECONDS = Number.parseInt(
  process.env.AQDATA_HTTP_IDLE_TIMEOUT_S ?? "255",
  10
);

function handleHealth(): Response {
  return Response.json({
    service: "aqdata-worker",
    success: true,
    timestamp: new Date().toISOString(),
  });
}

serve({
  hostname: "0.0.0.0",
  idleTimeout:
    Number.isFinite(IDLE_TIMEOUT_SECONDS) && IDLE_TIMEOUT_SECONDS > 0
      ? Math.min(255, IDLE_TIMEOUT_SECONDS)
      : 255,
  port: PORT,
  routes: {
    "/health": {
      GET: handleHealth,
    },
    "/api/sync": {
      POST: handleSync,
    },
    "/api/sync/company": {
      POST: handleCompanySync,
    },
    "/api/scrape": {
      POST: handleScrapeRun,
    },
    "/api/scrape/:id": {
      GET(req) {
        return handleScrapePermit(req.params.id);
      },
    },
    "/api/scrape/status": {
      GET: handleScrapeStatus,
    },
    "/api/scrape/start": {
      POST: handleScrapeStart,
    },
    "/api/scrape/stop": {
      POST: handleScrapeStop,
    },
  },
});

console.log(`AQData Worker API listening on http://localhost:${PORT}`);

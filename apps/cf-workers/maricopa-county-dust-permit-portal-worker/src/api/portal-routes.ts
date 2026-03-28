import type { Browser, BrowserEndpoint } from "@cloudflare/playwright";
import type { Page } from "playwright";

import { type CreateFlow, ensureLoggedIn, openMyDustApps, runMinimalCreate } from "../create";
import {
  deleteAllDrafts,
  deleteDraftByApplicationId,
  type DeleteDraftsResult,
} from "../delete";
import { PORTAL_TIMINGS } from "../portal-shared";

interface PortalEnv {
  BROWSER?: unknown;
  DUST_PERMIT_PASSWORD?: string;
  DUST_PERMIT_USERNAME?: string;
}

const readRequestBody = async (
  request: Request
): Promise<Record<string, unknown> | null> => {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const readNonEmptyString = (
  body: Record<string, unknown> | null,
  key: string
): string | null => {
  if (!body) {
    return null;
  }

  const value = body[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

const readCreateFlow = (value: string | null): CreateFlow["flow"] =>
  value === "existing-company" ? "existing-company" : "new-company";

const toDeleteFailureStatus = (result: DeleteDraftsResult): number => {
  switch (result.code) {
    case "navigate_failed": {
      return 500;
    }
    case "not_found": {
      return 404;
    }
    default: {
      return 422;
    }
  }
};

const readPortalCredentials = (
  env: PortalEnv
): { password: string; username: string } | null => {
  const username = env.DUST_PERMIT_USERNAME?.trim();
  const password = env.DUST_PERMIT_PASSWORD?.trim();
  if (!username || !password) {
    return null;
  }

  return { password, username };
};

const launchPortalSession = async (
  env: PortalEnv
): Promise<{ browser: Browser; page: Page }> => {
  const { launch } = await import("@cloudflare/playwright");
  const browser = await launch(env.BROWSER as BrowserEndpoint);
  const page = (await browser.newPage()) as unknown as Page;
  page.setDefaultTimeout(PORTAL_TIMINGS.sessionMs);
  page.setDefaultNavigationTimeout(PORTAL_TIMINGS.sessionMs);
  return { browser, page };
};

export const handlePortalCreateRoute = async (
  request: Request,
  env: PortalEnv
): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed", success: false },
      { status: 405 }
    );
  }

  if (!env.BROWSER) {
    return Response.json(
      { error: "BROWSER binding is not configured", success: false },
      { status: 500 }
    );
  }

  const credentials = readPortalCredentials(env);
  if (!credentials) {
    return Response.json(
      {
        error:
          "Missing DUST_PERMIT_USERNAME and/or DUST_PERMIT_PASSWORD environment variables",
        success: false,
      },
      { status: 400 }
    );
  }

  const body = await readRequestBody(request);
  const options: CreateFlow = {
    companyName: readNonEmptyString(body, "companyName") ?? undefined,
    copyFromApp: readNonEmptyString(body, "copyFromApp") ?? undefined,
    flow: readCreateFlow(readNonEmptyString(body, "flow")),
  };

  let browser: Browser | null = null;
  try {
    const session = await launchPortalSession(env);
    browser = session.browser;

    if (!(await ensureLoggedIn(session.page, credentials.username, credentials.password))) {
      return Response.json(
        { error: "Login failed", success: false },
        { status: 401 }
      );
    }

    if (!(await openMyDustApps(session.page))) {
      return Response.json(
        {
          error: "Could not reach My Dust Apps after login",
          success: false,
        },
        { status: 500 }
      );
    }

    const result = await runMinimalCreate(session.page, options);
    if (!result.permitId) {
      return Response.json(
        { error: result.error, success: false },
        { status: 422 }
      );
    }

    return Response.json({
      applicationId: result.permitId,
      permitId: result.permitId,
      success: true,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
        success: false,
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {
        // Ignore teardown errors.
      });
    }
  }
};

export const handlePortalDeleteRoute = async (
  request: Request,
  env: PortalEnv
): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed", success: false },
      { status: 405 }
    );
  }

  if (!env.BROWSER) {
    return Response.json(
      { error: "BROWSER binding is not configured", success: false },
      { status: 500 }
    );
  }

  const credentials = readPortalCredentials(env);
  if (!credentials) {
    return Response.json(
      {
        error:
          "Missing DUST_PERMIT_USERNAME and/or DUST_PERMIT_PASSWORD environment variables",
        success: false,
      },
      { status: 400 }
    );
  }

  const body = await readRequestBody(request);
  const applicationId = readNonEmptyString(body, "applicationId");

  let browser: Browser | null = null;
  try {
    const session = await launchPortalSession(env);
    browser = session.browser;

    if (!(await ensureLoggedIn(session.page, credentials.username, credentials.password))) {
      return Response.json(
        { error: "Login failed", success: false },
        { status: 401 }
      );
    }

    const result = applicationId
      ? await deleteDraftByApplicationId(
          session.page,
          session.page.context(),
          applicationId
        )
      : await deleteAllDrafts(session.page, session.page.context());

    if (!result.success) {
      return Response.json(
        {
          ...result,
          applicationId: applicationId ?? null,
          success: false,
        },
        { status: toDeleteFailureStatus(result) }
      );
    }

    return Response.json({
      ...result,
      applicationId: applicationId ?? null,
      success: true,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
        success: false,
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {
        // Ignore teardown errors.
      });
    }
  }
};

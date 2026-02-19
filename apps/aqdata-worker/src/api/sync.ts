import { runAQSync } from "../services/sync";

let syncInFlight: Promise<Response> | null = null;
let companySyncInFlight: Promise<Response> | null = null;

export function handleSync(): Promise<Response> {
  if (!syncInFlight) {
    syncInFlight = runResponse(() => runAQSync({ companyOnly: false })).finally(
      () => {
        syncInFlight = null;
      }
    );
  }
  return syncInFlight;
}

export function handleCompanySync(): Promise<Response> {
  if (!companySyncInFlight) {
    companySyncInFlight = runResponse(() =>
      runAQSync({ companyOnly: true })
    ).finally(() => {
      companySyncInFlight = null;
    });
  }
  return companySyncInFlight;
}

async function runResponse<T extends object>(
  run: () => Promise<T>
): Promise<Response> {
  try {
    const payload = await run();
    return Response.json(
      {
        ...payload,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        error: msg,
        success: false,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

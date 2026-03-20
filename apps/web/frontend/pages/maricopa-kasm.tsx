import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import { buildKasmViewerUrl } from "@/apps/web/frontend/lib/kasm-viewer";

interface KasmStatusResponse {
  kasmUrl?: string;
}

function buildKasmIframeAllow(origin: string): string {
  return [
    `cross-origin-isolated ${origin}`,
    `fullscreen ${origin}`,
    `window-management ${origin}`,
  ].join("; ");
}

export default function MaricopaKasmPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function openKasm() {
      const readyResponse = await fetch("/api/automation/kasm/ready", {
        method: "POST",
      });

      if (!readyResponse.ok) {
        throw new Error(`Ready request failed: ${readyResponse.status}`);
      }

      const statusResponse = await fetch("/api/automation/kasm/status");
      if (!statusResponse.ok) {
        throw new Error(`Status request failed: ${statusResponse.status}`);
      }

      const status = (await statusResponse.json()) as KasmStatusResponse;
      const nextViewerUrl = buildKasmViewerUrl(status.kasmUrl ?? "");

      if (!nextViewerUrl) {
        throw new Error("Kasm URL missing from status response");
      }

      if (!cancelled) {
        setViewerUrl(nextViewerUrl);
      }
    }

    openKasm().catch((error: unknown) => {
      if (!cancelled) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to open Kasm"
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const iframeAllow = useMemo(() => {
    if (!viewerUrl) {
      return "";
    }

    return buildKasmIframeAllow(new URL(viewerUrl).origin);
  }, [viewerUrl]);

  let content = (
    <div className="flex flex-1 items-center justify-center font-mono text-sm text-white/40">
      Preparing embedded Kasm workspace...
    </div>
  );

  if (errorMessage) {
    content = (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
          <div className="space-y-3">
            <p className="font-medium text-red-300">
              Unable to load the embedded Kasm viewer.
            </p>
            <p>{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  } else if (viewerUrl) {
    content = (
      <iframe
        allow={iframeAllow}
        className="h-full w-full flex-1 border-0 bg-black"
        loading="eager"
        src={viewerUrl}
        title="Maricopa Kasm"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <PageHeader
        breadcrumbs={[
          { label: "Automation", href: "/automation" },
          { label: "Maricopa Kasm" },
        ]}
        description="Embedded Kasm WebRTC workspace"
        title="Maricopa Kasm"
      />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
        {content}
      </div>
    </div>
  );
}

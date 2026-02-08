/**
 * Automation Page
 *
 * Placeholder for browser automation controls.
 * Opens a VNC viewer to watch/interact with the permit-worker's browser session.
 */

import { ExternalLink, Monitor } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { VncViewer } from "@/apps/web/frontend/components/vnc-viewer";

export function AutomationPage() {
  const [vncOpen, setVncOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Automation" }]}
        title="Browser Automation"
      />

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Monitor className="h-8 w-8 text-primary" />
          </div>

          <div>
            <h2 className="font-semibold text-foreground text-lg">
              Permit Portal Automation
            </h2>
            <p className="mt-2 text-muted-foreground text-sm">
              Watch and interact with browser automation sessions running on the
              Maricopa County permit portal. Open the VNC viewer to see the
              browser in real-time.
            </p>
          </div>

          <div className="flex gap-3">
            <Button className="gap-2" onClick={() => setVncOpen(true)}>
              <Monitor className="h-4 w-4" />
              Open VNC Viewer
            </Button>
            <Button
              className="gap-2"
              onClick={() =>
                window.open(
                  "http://localhost:47821",
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              variant="outline"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Tab
            </Button>
          </div>
        </div>
      </div>

      <VncViewer
        onOpenChange={setVncOpen}
        open={vncOpen}
        subtitle="Permit-worker browser session"
        title="Permit Portal"
      />
    </div>
  );
}

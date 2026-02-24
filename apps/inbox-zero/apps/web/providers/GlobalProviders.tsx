import { NuqsAdapter } from "nuqs/adapters/next/app";
import type React from "react";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { EmailAccountProvider } from "@/providers/EmailAccountProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";
import { SWRProvider } from "@/providers/SWRProvider";

export function GlobalProviders(props: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <EmailAccountProvider>
        <SWRProvider>
          <StatLoaderProvider>
            <ComposeModalProvider>{props.children}</ComposeModalProvider>
          </StatLoaderProvider>
        </SWRProvider>
      </EmailAccountProvider>
    </NuqsAdapter>
  );
}

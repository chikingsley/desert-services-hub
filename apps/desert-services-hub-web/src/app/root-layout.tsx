import { Outlet, ScrollRestoration } from "react-router";

import { AppShell } from "@/components/layout/app-shell";

export const RootLayout = () => (
  <>
    <AppShell>
      <Outlet />
    </AppShell>
    <ScrollRestoration />
  </>
);

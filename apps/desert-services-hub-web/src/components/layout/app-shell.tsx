import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface AppShellProps {
  children: ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => (
  <SidebarProvider className="min-h-svh bg-sidebar" defaultOpen>
    <AppSidebar />
    <SidebarInset className="min-h-svh overflow-auto bg-muted/35">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-border/70 bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger className="-ml-1" />
      </header>

      <div className="flex flex-1 flex-col px-6 py-8 lg:px-8 lg:py-10">
        {children}
      </div>
    </SidebarInset>
  </SidebarProvider>
);

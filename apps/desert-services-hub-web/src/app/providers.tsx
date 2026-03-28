import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

interface AppProvidersProps {
  children: ReactNode;
}

export const AppProviders = ({ children }: AppProvidersProps) => (
  <TooltipProvider>{children}</TooltipProvider>
);

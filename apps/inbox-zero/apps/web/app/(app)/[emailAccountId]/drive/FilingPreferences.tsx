"use client";

import { useAccount } from "@/providers/EmailAccountProvider";
import { AllowedFolders } from "./AllowedFolders";
import { FilingRulesForm } from "./FilingRulesForm";

export function FilingPreferences() {
  const { emailAccountId } = useAccount();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AllowedFolders emailAccountId={emailAccountId} />
      <FilingRulesForm emailAccountId={emailAccountId} />
    </div>
  );
}

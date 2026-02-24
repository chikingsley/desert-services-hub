import { AddRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/AddRuleDialog";
import { BulkRunRules } from "@/app/(app)/[emailAccountId]/assistant/BulkRunRules";
import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { MutedText } from "@/components/Typography";

export function RulesTab() {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <MutedText className="hidden sm:block">
          Your assistant automatically organizes incoming emails using these
          rules.
        </MutedText>

        <div className="flex shrink-0 items-center gap-2">
          <BulkRunRules />
          <AddRuleDialog />
        </div>
      </div>
      <Rules showAddRuleButton={false} />
    </div>
  );
}

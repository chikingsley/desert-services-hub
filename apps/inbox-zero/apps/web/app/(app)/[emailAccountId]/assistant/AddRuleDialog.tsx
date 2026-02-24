import { PlusIcon } from "lucide-react";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/assistant/RulesPromptNew";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export function AddRuleDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button Icon={PlusIcon} size="sm">
          Add Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <RulesPrompt />
      </DialogContent>
    </Dialog>
  );
}

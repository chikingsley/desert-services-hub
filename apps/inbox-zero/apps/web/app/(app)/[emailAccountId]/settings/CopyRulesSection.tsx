"use client";

import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { CopyRulesDialog } from "@/app/(app)/[emailAccountId]/settings/CopyRulesDialog";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";

type Account = {
  id: string;
  name: string | null;
  email: string;
};

export function CopyRulesSection({
  emailAccountId,
  emailAccountEmail,
  allAccounts,
}: {
  emailAccountId: string;
  emailAccountEmail: string;
  allAccounts: Account[];
}) {
  const [open, setOpen] = useState(false);

  const sourceAccounts = allAccounts.filter((a) => a.id !== emailAccountId);

  if (sourceAccounts.length === 0) {
    return null;
  }

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Copy Rules From Another Account</ItemTitle>
        </ItemContent>
        <ItemActions>
          <Button onClick={() => setOpen(true)} size="sm" variant="outline">
            <ArrowLeftRight className="mr-2 size-4" />
            Copy Rules
          </Button>
        </ItemActions>
      </Item>

      <CopyRulesDialog
        onOpenChange={setOpen}
        open={open}
        sourceAccounts={sourceAccounts}
        targetAccountEmail={emailAccountEmail}
        targetAccountId={emailAccountId}
      />
    </>
  );
}

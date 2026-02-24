"use client";

import { KnowledgeBase } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeBase";
import { useDraftReplies } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftReplies";
import { SettingCard } from "@/components/SettingCard";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DraftKnowledgeSetting() {
  const { enabled, loading } = useDraftReplies();

  const isEnabled = !loading && enabled;

  const kb = <KnowledgeDialog enabled={isEnabled} />;

  return (
    <SettingCard
      description="Information the assistant uses when writing replies."
      right={
        isEnabled ? (
          kb
        ) : (
          <Tooltip content="Enable draft replies to edit the knowledge base">
            <span>{kb}</span>
          </Tooltip>
        )
      }
      title="Draft knowledge base"
    />
  );
}

function KnowledgeDialog({ enabled }: { enabled: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={!enabled} size="sm" variant="outline">
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draft knowledge base</DialogTitle>
          <DialogDescription>
            This is used to help the assistant draft replies.
          </DialogDescription>
        </DialogHeader>
        <KnowledgeBase />
      </DialogContent>
    </Dialog>
  );
}

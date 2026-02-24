"use client";

import { XIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback } from "react";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/assistant/RulesPrompt";
import { RuleTab } from "@/app/(app)/[emailAccountId]/assistant/RuleTab";
import { SettingsTab } from "@/app/(app)/[emailAccountId]/assistant/settings/SettingsTab";
import { TabsToolbar } from "@/components/TabsToolbar";
import { TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AssistantTabs() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs className="flex h-full flex-col" defaultValue="empty">
        <TabsToolbar className="shrink-0 border-none pb-0 shadow-none">
          <div className="w-full overflow-x-auto">
            <TabsList>
              {/* <TabsTrigger value="prompt">Prompt</TabsTrigger> */}
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </div>
          <CloseArtifactButton />
        </TabsToolbar>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent className="mt-0 h-full" value="empty">
            <div className="flex h-full items-center justify-center">
              <TypographyP className="max-w-sm px-4 text-center">
                Select a tab or add rules via the assistant
              </TypographyP>
            </div>
          </TabsContent>

          <TabsContent className="mt-0 h-full" value="prompt">
            <RulesPrompt />
          </TabsContent>
          <TabsContent className="pb-4 content-container" value="rules">
            <Rules />
          </TabsContent>
          <TabsContent className="pb-4 content-container" value="test">
            <Process />
          </TabsContent>
          <TabsContent className="pb-4 content-container" value="history">
            <History />
          </TabsContent>
          <TabsContent className="pb-4 content-container" value="settings">
            <SettingsTab />
          </TabsContent>
          {/* Set via search params. Not a visible tab. */}
          <TabsContent className="pb-4 content-container" value="rule">
            <RuleTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function CloseArtifactButton() {
  const [_tab, setTab] = useQueryState("tab");

  const onClose = useCallback(() => setTab(null), [setTab]);

  return (
    <Button onClick={onClose} size="icon" variant="ghost">
      <XIcon className="size-4" />
    </Button>
  );
}

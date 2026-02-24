import { AboutSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/AboutSetting";
import { DigestSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DigestSetting";
import { DraftKnowledgeSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftKnowledgeSetting";
import { DraftReplies } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftReplies";
import { FollowUpRemindersSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/FollowUpRemindersSetting";
import { LearnedPatternsSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/LearnedPatternsSetting";
import { MultiRuleSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/MultiRuleSetting";
import { PersonalSignatureSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/PersonalSignatureSetting";
import { ProactiveUpdatesSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/ProactiveUpdatesSetting";
import { WritingStyleSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/WritingStyleSetting";
import { SectionHeader } from "@/components/Typography";
import { env } from "@/env";

export function SettingsTab() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <DraftReplies />
        <FollowUpRemindersSetting />
        <ProactiveUpdatesSetting />
        {env.NEXT_PUBLIC_DIGEST_ENABLED && <DigestSetting />}
      </div>

      <div className="space-y-2">
        <SectionHeader>Your voice</SectionHeader>
        <WritingStyleSetting />
        <AboutSetting />
        <PersonalSignatureSetting />
      </div>

      <div className="space-y-2">
        <SectionHeader>Knowledge</SectionHeader>
        <DraftKnowledgeSetting />
        <LearnedPatternsSetting />
      </div>

      <div className="space-y-2">
        <SectionHeader>Advanced</SectionHeader>
        <MultiRuleSetting />
      </div>
    </div>
  );
}

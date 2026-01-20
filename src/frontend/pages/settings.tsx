/**
 * Settings Page
 */
import { PageHeader } from "@/components/page-header";

export function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader description="Configure your preferences" title="Settings" />
      <div className="flex-1 p-6 lg:p-8">
        <p className="text-muted-foreground">Settings UI coming soon.</p>
      </div>
    </div>
  );
}

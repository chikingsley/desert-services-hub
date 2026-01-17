"use client";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "../../hooks/use-settings";

export default function SettingsPage() {
  const { autoHideSidebar, setAutoHideSidebar } = useSettings();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader breadcrumbs={[{ label: "Settings" }]} title="Settings" />

      <div className="flex-1 p-6 lg:p-8">
        <div className="page-transition max-w-4xl space-y-6">
          <Card className="rounded-xl border border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle>Workspace Behavior</CardTitle>
              <CardDescription>
                Configure how the workspace interacts with the application UI.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between space-x-2">
                <div className="flex flex-col space-y-1">
                  <Label htmlFor="auto-hide-sidebar">
                    Auto-hide sidebar in Preview
                  </Label>
                  <span className="text-muted-foreground text-sm">
                    Automatically collapse the sidebar when opening the quote
                    preview.
                  </span>
                </div>
                <Switch
                  checked={autoHideSidebar}
                  id="auto-hide-sidebar"
                  onCheckedChange={setAutoHideSidebar}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

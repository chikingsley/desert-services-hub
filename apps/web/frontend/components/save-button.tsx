import { Spinner } from "@/apps/web/frontend/components/ui/spinner";

interface SaveButtonProps {
  isSaving: boolean;
  saveStatus: "saved" | "saving" | "unsaved";
}

export function SaveButtonIcon({ isSaving, saveStatus }: SaveButtonProps) {
  if (isSaving || saveStatus === "saving") {
    return <Spinner className="mr-2 h-4 w-4" />;
  }

  if (saveStatus === "saved") {
    return (
      <span className="mr-2 flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20">
        <span className="h-2 w-2 rounded-full bg-green-500" />
      </span>
    );
  }

  return (
    <span className="mr-2 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20">
      <span className="h-2 w-2 rounded-full bg-amber-500" />
    </span>
  );
}

export function SaveButtonLabel({ isSaving, saveStatus }: SaveButtonProps) {
  if (isSaving) {
    return "Saving...";
  }
  if (saveStatus === "saved") {
    return "Saved";
  }
  return "Save";
}

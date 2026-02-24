import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";

export function OnboardingButton({
  text,
  icon,
  onClick,
}: {
  text: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center gap-4 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition-all hover:border-blue-600 hover:ring-2 hover:ring-blue-100"
      onClick={onClick}
      type="button"
    >
      <IconCircle size="sm">{icon}</IconCircle>

      <div className="flex-1">
        <div className="font-medium">{text}</div>
      </div>
    </button>
  );
}

import { cn } from "@/utils";

export function OnboardingWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col justify-center bg-slate-50 text-gray-900 sm:px-6 sm:py-20",
        className
      )}
    >
      <div className="fade-in mx-auto flex max-w-6xl animate-in flex-col justify-center space-y-6 p-4 duration-500 sm:p-10">
        {children}
      </div>
    </div>
  );
}

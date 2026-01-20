import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  variant?: "icon" | "full";
}

export function Logo({ className, variant = "icon" }: LogoProps) {
  const src = variant === "full"
    ? "/desert-services-full-logo.svg"
    : "/desert-services-logo.svg";

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <img
        src={src}
        alt="Desert Services Logo"
        className="h-full w-auto"
      />
    </div>
  );
}

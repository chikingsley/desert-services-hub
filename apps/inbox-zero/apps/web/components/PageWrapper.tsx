import { cn } from "@/utils";

export function PageWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto mb-12 w-full max-w-screen-2xl px-4 md:mb-4 xl:px-20 2xl:px-36",
        className
      )}
    >
      {children}
    </div>
  );
}

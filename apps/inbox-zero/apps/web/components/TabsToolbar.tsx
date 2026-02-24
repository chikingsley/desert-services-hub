import { cn } from "@/utils";

interface TabsToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function TabsToolbar({
  className,
  children,
  ...props
}: TabsToolbarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col justify-between gap-x-4 space-y-2 border-border border-b bg-background py-2 shadow-sm content-container md:flex-row md:gap-x-6 md:space-y-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

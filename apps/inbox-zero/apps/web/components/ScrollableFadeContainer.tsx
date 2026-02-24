"use client";

import { forwardRef, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils";

interface ScrollableFadeContainerProps {
  children: ReactNode;
  className?: string;
  fadeFromClass?: string;
  fadeHeight?: string;
  height?: string;
  showBottomFade?: boolean;
  showTopFade?: boolean;
}

export const ScrollableFadeContainer = forwardRef<
  HTMLDivElement,
  ScrollableFadeContainerProps
>(function ScrollableFadeContainer(
  {
    children,
    className,
    height = "h-[500px]",
    showTopFade = true,
    showBottomFade = true,
    fadeHeight = "h-8",
    fadeFromClass = "from-background",
  },
  ref
) {
  return (
    <div className="relative">
      {showTopFade && (
        <div
          className={cn(
            "pointer-events-none absolute top-0 right-0 left-0 z-10 bg-gradient-to-b to-transparent",
            fadeHeight,
            fadeFromClass
          )}
        />
      )}

      <ScrollArea className={cn(height, "pr-1.5")}>
        <div className={className} ref={ref}>
          {children}
        </div>
      </ScrollArea>

      {showBottomFade && (
        <div
          className={cn(
            "pointer-events-none absolute right-0 bottom-0 left-0 z-10 bg-gradient-to-t to-transparent",
            fadeHeight,
            fadeFromClass
          )}
        />
      )}
    </div>
  );
});

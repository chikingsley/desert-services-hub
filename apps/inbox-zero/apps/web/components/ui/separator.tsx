"use client";

import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as React from "react";

import { cn } from "@/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> & {
    theme?: "light" | "dark";
  }
>(
  (
    {
      className,
      orientation = "horizontal",
      decorative = true,
      theme = "light",
      ...props
    },
    ref
  ) => (
    <SeparatorPrimitive.Root
      className={cn(
        theme === "dark"
          ? "bg-slate-800 dark:bg-slate-200"
          : "bg-slate-200 dark:bg-slate-800",
        "shrink-0",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      decorative={decorative}
      orientation={orientation}
      ref={ref}
      {...props}
    />
  )
);
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };

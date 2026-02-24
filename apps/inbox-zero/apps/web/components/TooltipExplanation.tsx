"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { HelpCircleIcon } from "lucide-react";
import { useCallback, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";

const tooltipIconVariants = cva("cursor-pointer", {
  variants: {
    size: {
      sm: "h-4 w-4",
      md: "h-5 w-5",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

interface TooltipExplanationProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof tooltipIconVariants> {
  side?: "top" | "right" | "bottom" | "left";
  text: string;
}

export function TooltipExplanation({
  text,
  size,
  className,
  side = "top",
}: TooltipExplanationProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip onOpenChange={setIsOpen} open={isOpen}>
        <TooltipTrigger asChild>
          <HelpCircleIcon
            className={cn(tooltipIconVariants({ size }), className)}
            onClick={handleClick}
          />
        </TooltipTrigger>
        <TooltipContent side={side}>
          <p className="max-w-xs">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

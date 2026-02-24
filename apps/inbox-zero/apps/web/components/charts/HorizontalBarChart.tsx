"use client";

import { DomainIcon } from "@/components/charts/DomainIcon";
import { cn } from "@/utils";
import { extractDomainFromEmail } from "@/utils/email";

interface HorizontalBarChartProps {
  className?: string;
  data: Array<{
    name: string;
    value: number;
    href?: string;
    target?: string;
  }>;
}

export function HorizontalBarChart({
  data,
  className,
}: HorizontalBarChartProps) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className={cn("space-y-2", className)}>
      {data.map((item) => {
        const widthPercentage = (item.value / maxValue) * 100;
        const domain = extractDomainFromEmail(item.name) || item.name;

        return (
          <div
            className="flex items-center justify-between gap-4"
            key={item.name}
          >
            <div className="min-w-0 flex-1">
              <div className="relative px-3 py-2">
                <div
                  className="absolute top-0 left-0 h-full rounded-md bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-500 dark:to-blue-500/80"
                  style={{ width: `${widthPercentage}%` }}
                />
                <div className="flex items-center gap-2">
                  <DomainIcon domain={domain} variant="circular" />
                  {item.href ? (
                    <a
                      className="relative z-10 block truncate text-gray-900 text-sm hover:underline dark:text-gray-100"
                      href={item.href}
                      rel={
                        item.target === "_blank"
                          ? "noopener noreferrer"
                          : undefined
                      }
                      target={item.target}
                    >
                      {item.name}
                    </a>
                  ) : (
                    <span className="relative z-10 block truncate text-gray-900 text-sm">
                      {item.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0">
              <span className="text-gray-600 text-sm">
                {item.value.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

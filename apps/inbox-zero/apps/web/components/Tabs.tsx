"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface TabsProps {
  breakpoint?: "xs" | "sm" | "md" | "lg" | "xl";
  onClickTab?: (tab: Tab) => void;
  selected: string;
  shallow?: boolean;
  tabs: Tab[];
}

interface Tab {
  href?: string;
  label: string;
  value: string;
}

export function Tabs(props: TabsProps) {
  const { tabs, selected, breakpoint = "sm", onClickTab } = props;
  const router = useRouter();

  return (
    <div className="w-full">
      <div
        className={clsx({
          hidden: breakpoint === "xs",
          "sm:hidden": breakpoint === "sm",
          "md:hidden": breakpoint === "md",
          "lg:hidden": breakpoint === "lg",
          "xl:hidden": breakpoint === "xl",
        })}
      >
        <label className="sr-only" htmlFor="tabs">
          Select a tab
        </label>
        <select
          className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          defaultValue={selected}
          id="tabs"
          name="tabs"
          onChange={(e) => {
            const label = e.target.value;
            const tab = tabs.find((t) => t.label === label);
            if (tab) {
              onClickTab?.(tab);
              if (tab.href) {
                router.push(tab.href);
              }
            }
          }}
        >
          {tabs.map((tab) => (
            <option key={tab.label}>{tab.label}</option>
          ))}
        </select>
      </div>
      <div
        className={clsx({
          block: breakpoint === "xs",
          "hidden sm:block": breakpoint === "sm",
          "hidden md:block": breakpoint === "md",
          "hidden lg:block": breakpoint === "lg",
          "hidden xl:block": breakpoint === "xl",
        })}
      >
        <nav aria-label="Tabs" className="flex space-x-4">
          {tabs.map((tab) => {
            const isSelected = tab.value === selected;

            return (
              <Link
                aria-current={isSelected ? "page" : undefined}
                className={clsx(
                  "whitespace-nowrap rounded-md px-3 py-2 font-medium text-sm",
                  isSelected
                    ? "bg-blue-100 text-blue-700"
                    : "text-muted-foreground hover:text-gray-700"
                )}
                href={tab.href || "#"}
                key={tab.value}
                onClick={onClickTab ? () => onClickTab(tab) : undefined}
                shallow={props.shallow}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

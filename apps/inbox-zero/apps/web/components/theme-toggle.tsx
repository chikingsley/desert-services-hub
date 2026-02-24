"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/utils";

export function ThemeToggle({ focus }: { focus?: boolean }) {
  const { setTheme, theme } = useTheme();

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  return (
    <button
      className={cn(
        "flex w-full items-center px-3 py-1 text-foreground text-sm leading-6",
        focus && "bg-accent"
      )}
      onClick={toggleTheme}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleTheme();
        }
      }}
      type="button"
    >
      {theme === "light" ? (
        <MoonIcon className="mr-2 h-4 w-4" />
      ) : (
        <SunIcon className="mr-2 h-4 w-4" />
      )}
      {theme === "light" ? "Dark" : "Light"} mode
    </button>
  );
}

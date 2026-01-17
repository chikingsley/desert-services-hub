"use client";

import { useCallback, useEffect, useState } from "react";

const SETTINGS_KEY = "ds-hub-settings";

interface Settings {
  autoHideSidebar: boolean;
}

const defaultSettings: Settings = {
  autoHideSidebar: true,
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(saved) });
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save settings when they change
  const setAutoHideSidebar = useCallback((value: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, autoHideSidebar: value };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    autoHideSidebar: settings.autoHideSidebar,
    setAutoHideSidebar,
    isLoaded,
  };
}

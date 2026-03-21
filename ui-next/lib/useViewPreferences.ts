import { useCallback, useState } from "react";

const STORAGE_KEY = "rss_view_preferences";

export type Density = "compact" | "default" | "cozy";
export type TextSize = "sm" | "base" | "lg";

export interface ViewPreferences {
  density: Density;
  textSize: TextSize;
}

const DEFAULTS: ViewPreferences = { density: "default", textSize: "base" };

function readPrefs(): ViewPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return {
      ...DEFAULTS,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"),
    };
  } catch {
    return DEFAULTS;
  }
}

function writePrefs(p: ViewPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export function useViewPreferences() {
  const [prefs, setPrefs] = useState<ViewPreferences>(readPrefs);

  const setDensity = useCallback((density: Density) => {
    setPrefs((prev) => {
      const next = { ...prev, density };
      writePrefs(next);
      return next;
    });
  }, []);

  const setTextSize = useCallback((textSize: TextSize) => {
    setPrefs((prev) => {
      const next = { ...prev, textSize };
      writePrefs(next);
      return next;
    });
  }, []);

  return { prefs, setDensity, setTextSize };
}

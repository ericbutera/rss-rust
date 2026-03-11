import { useCallback, useState } from "react";

const STORAGE_KEY = "rss_feed_verifications";

// feedId → taskId
type Verifications = Record<number, string>;

function readFromStorage(): Verifications {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeToStorage(v: Verifications) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
}

/**
 * Manages a persistent map of pending feed verification tasks.
 * State survives page refreshes via localStorage.
 */
export function usePendingVerifications() {
  const [verifications, setVerifications] =
    useState<Verifications>(readFromStorage);

  const add = useCallback((feedId: number, taskId: string) => {
    setVerifications((prev) => {
      const next = { ...prev, [feedId]: taskId };
      writeToStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((feedId: number) => {
    setVerifications((prev) => {
      const next = { ...prev };
      delete next[feedId];
      writeToStorage(next);
      return next;
    });
  }, []);

  return { verifications, add, remove };
}

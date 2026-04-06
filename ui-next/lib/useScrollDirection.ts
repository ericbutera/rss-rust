"use client";

import { useEffect, useState } from "react";

type ScrollDirection = "up" | "down";

/**
 * Tracks whether the user is scrolling up or down on the window.
 * Always returns "up" when near the top of the page so the navbar
 * is guaranteed to reappear before the page top is reached.
 */
export function useScrollDirection(threshold = 8): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>("up");

  useEffect(() => {
    let lastY = window.scrollY;

    function handleScroll() {
      const y = window.scrollY;
      // Always show when close to the top
      if (y < 60) {
        setDirection("up");
        lastY = y;
        return;
      }
      const delta = y - lastY;
      if (Math.abs(delta) < threshold) return;
      setDirection(delta > 0 ? "down" : "up");
      lastY = y;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return direction;
}

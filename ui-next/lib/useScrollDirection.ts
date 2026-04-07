"use client";

import { useRef, useState } from "react";
import { useEventListener } from "usehooks-ts";

type ScrollDirection = "up" | "down";

/**
 * Tracks whether the user is scrolling up or down on the window.
 * Always returns "up" when near the top of the page so the navbar
 * is guaranteed to reappear before the page top is reached.
 */
export function useScrollDirection(
  threshold = 8,
  paused = false,
): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>("up");
  const lastY = useRef(typeof window !== "undefined" ? window.scrollY : 0);

  useEventListener("scroll", () => {
    if (paused) return;
    const y = window.scrollY;
    // Always show when close to the top
    if (y < 60) {
      setDirection("up");
      lastY.current = y;
      return;
    }
    const delta = y - lastY.current;
    if (Math.abs(delta) < threshold) return;
    setDirection(delta > 0 ? "down" : "up");
    lastY.current = y;
  });

  return direction;
}

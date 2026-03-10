"use client";

import {
  faCircleCheck,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTaskStatus, type FeedResponse } from "../../src/lib/queries";

interface VerificationIndicatorProps {
  feed: FeedResponse;
  taskId: string;
  onDone: () => void;
}

/**
 * Polls a background verification task for a feed and shows inline status.
 * Persists across page refreshes — the parent should supply a taskId read
 * from localStorage so the indicator reappears after navigation.
 */
export default function VerificationIndicator({
  feed,
  taskId,
  onDone,
}: VerificationIndicatorProps) {
  const queryClient = useQueryClient();
  const { data: rawData } = useTaskStatus(taskId);
  const status = (rawData as { status?: string } | undefined)?.status;

  // If the server already has verified_at set (e.g. after a refresh where
  // verification completed before the component mounted), silently clean up.
  useEffect(() => {
    if (feed.verified_at) {
      onDone();
    }
  }, [feed.verified_at, onDone]);

  useEffect(() => {
    if (status === "completed") {
      // Refresh the feed list so verified_at propagates into the response.
      queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
      const t = setTimeout(onDone, 3000);
      return () => clearTimeout(t);
    }
  }, [status, onDone, queryClient]);

  // Already verified server-side — render nothing while the cleanup effect runs.
  if (feed.verified_at) return null;

  if (status === "completed") {
    return (
      <span
        className="tooltip tooltip-bottom shrink-0"
        data-tip="Feed verified"
      >
        <FontAwesomeIcon
          icon={faCircleCheck}
          className="text-success text-xs"
        />
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        className="tooltip tooltip-bottom shrink-0"
        data-tip="Verification failed — feed may be unreachable"
      >
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className="text-warning text-xs"
        />
      </span>
    );
  }

  // pending or processing
  return (
    <span
      className="tooltip tooltip-bottom shrink-0"
      data-tip="Verifying feed…"
    >
      <span className="loading loading-spinner loading-xs opacity-60" />
    </span>
  );
}

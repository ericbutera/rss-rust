"use client";

import { API_URL } from "@/lib/config";
import type { FeedResponse } from "@/lib/queries";
import type { Verifications } from "@/lib/usePendingVerifications";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { faRss } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback } from "react";
import VerificationIndicator from "./VerificationIndicator";

interface SortableFeedItemProps {
  feed: FeedResponse;
  isSelected: boolean;
  isNested?: boolean;
  onSelectFeed: (feed: FeedResponse | null) => void;
  taskId: string | null;
  onRemoveVerification: (id: number) => void;
}

export default function FeedListItem({
  feed,
  isSelected,
  isNested = false,
  onSelectFeed,
  taskId,
  onRemoveVerification,
}: SortableFeedItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feed.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleVerificationDone = useCallback(
    () => onRemoveVerification(feed.id),
    [onRemoveVerification, feed.id],
  );

  const label =
    feed.name ??
    (() => {
      try {
        return new URL(feed.url).hostname;
      } catch {
        return feed.url || "Unknown feed";
      }
    })();
  const hasUnread = feed.unread_count > 0;

  return (
    <li ref={setNodeRef} style={style} className="w-full">
      <div
        className={`group relative flex w-full items-center gap-2 px-2 py-1 pr-10 rounded-btn cursor-grab active:cursor-grabbing ${isNested ? "pl-7" : ""} ${isDragging ? "opacity-40" : ""} ${isSelected ? "active" : ""}`}
        onClick={() => {
          if (!isSelected) onSelectFeed(feed);
        }}
        {...attributes}
        {...listeners}
      >
        {feed.favicon_url ? (
          <img
            src={`${API_URL}/favicons/${feed.favicon_url}`}
            alt=""
            width={14}
            height={14}
            className={`shrink-0 w-3.5 h-3.5 ${hasUnread ? "" : "opacity-60"}`}
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = "none";
              const icon = el.nextElementSibling as HTMLElement | null;
              if (icon) icon.style.display = "inline-block";
            }}
          />
        ) : (
          <FontAwesomeIcon
            icon={faRss}
            className={`shrink-0 ${hasUnread ? "text-primary" : "opacity-60"}${feed.favicon_url ? " hidden" : ""}`}
          />
        )}

        <div className="overflow-hidden min-w-0 flex-1">
          <span className="whitespace-nowrap block">{label}</span>
        </div>
        {taskId && (
          <VerificationIndicator
            feed={feed}
            taskId={taskId}
            onDone={handleVerificationDone}
          />
        )}
        {hasUnread && (
          <span className="badge badge-xs badge-soft badge-ghost absolute right-2 top-1/2 -translate-y-1/2">
            {feed.unread_count > 99 ? "99+" : feed.unread_count}
          </span>
        )}
      </div>
    </li>
  );
}

"use client";

import { useFeeds, type FeedResponse } from "@/lib/queries";
import { usePendingVerifications } from "@/lib/usePendingVerifications";
import { faLinkSlash, faRss } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import VerificationIndicator from "./VerificationIndicator";

interface FeedListProps {
  selectedFeed: FeedResponse | null;
  onSelectFeed: (feed: FeedResponse | null) => void;
}

export default function FeedList({
  selectedFeed,
  onSelectFeed,
}: FeedListProps) {
  const { data: feeds, isLoading } = useFeeds();
  const { verifications, remove: removeVerification } =
    usePendingVerifications();

  return (
    <ul className="menu menu-sm w-full gap-0.5">
      {isLoading && (
        <li>
          <span className="loading loading-spinner loading-xs" />
        </li>
      )}
      {!isLoading && feeds.length === 0 && (
        <li>
          <span className="text-xs opacity-50 flex items-center gap-2">
            <FontAwesomeIcon icon={faLinkSlash} />
            No feeds yet
          </span>
        </li>
      )}
      {feeds.map((feed: FeedResponse) => {
        const taskId = verifications[feed.id] ?? null;
        const label =
          feed.name ??
          (() => {
            try {
              return new URL(feed.url).hostname;
            } catch {
              return feed.url || "Unknown feed";
            }
          })();
        const isSelected = selectedFeed?.id === feed.id;
        const hasUnread = feed.unread_count > 0;
        return (
          <li key={feed.id}>
            <a
              className={`tooltip tooltip-right group flex items-center gap-2 ${isSelected ? "text-primary" : ""}`}
              onClick={() => onSelectFeed(isSelected ? null : feed)}
            >
              <FontAwesomeIcon
                icon={faRss}
                className={`shrink-0 ${hasUnread ? "text-primary" : "opacity-60"}`}
              />
              <div className="overflow-hidden min-w-0">
                <span className="whitespace-nowrap block ">{label}</span>
              </div>
              {taskId && (
                <VerificationIndicator
                  feed={feed}
                  taskId={taskId}
                  onDone={() => removeVerification(feed.id)}
                />
              )}
              {hasUnread && (
                <span className="badge badge-primary badge-sm shrink-0">
                  {feed.unread_count > 99 ? "99+" : feed.unread_count}
                </span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

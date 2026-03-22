"use client";

import { API_URL } from "@/lib/config";
import type { FeedResponse } from "@/lib/queries";
import { faRss } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import RenameFeedForm from "./RenameFeedForm";

interface Props {
  feed: FeedResponse;
  renaming: boolean;
  onDoneRename: () => void;
}

function feedDisplayName(feed: FeedResponse): string {
  if (feed.name) return feed.name;
  try {
    return new URL(feed.url).hostname;
  } catch {
    return feed.url;
  }
}

export default function FeedHeaderTitle({
  feed,
  renaming,
  onDoneRename,
}: Props) {
  const [faviconError, setFaviconError] = useState(false);

  return (
    <div className="flex-1 min-w-0 flex items-center gap-1.5">
      {!renaming && (
        <span className="shrink-0 text-xs opacity-60">
          {feed.favicon_url && !faviconError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}/favicons/${feed.favicon_url}`}
              alt=""
              width={14}
              height={14}
              className="w-3.5 h-3.5"
              onError={() => setFaviconError(true)}
            />
          ) : (
            <FontAwesomeIcon icon={faRss} />
          )}
        </span>
      )}
      {renaming ? (
        <RenameFeedForm feed={feed} onDone={onDoneRename} />
      ) : (
        <span className="truncate text-sm font-medium">
          {feedDisplayName(feed)}
        </span>
      )}
    </div>
  );
}

"use client";

import type { FeedResponse } from "@/lib/queries";
import {
  faCircleCheck,
  faClockRotateLeft,
  faRss,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface NavProps {
  feed: FeedResponse;
  onShowHistory: () => void;
  onMarkAllRead: () => void;
  onUnsubscribe: () => void;
}

export default function ViewHeader({
  feed,
  onShowHistory,
  onMarkAllRead,
  onUnsubscribe,
}: NavProps) {
  return (
    <div className="sticky top-0 z-20 bg-base-100 border-b border-base-300 px-4 py-2 flex items-center gap-3 min-w-0">
      <FontAwesomeIcon icon={faRss} className="opacity-50 shrink-0" />
      <span className="font-semibold truncate flex-1 min-w-0">
        {feed.name ?? feed.url}
      </span>
      {feed.unread_count > 0 && (
        <span className="badge badge-primary badge-sm shrink-0">
          {feed.unread_count}
        </span>
      )}
      <ul className="menu menu-horizontal bg-base-200 rounded-box p-1 shrink-0">
        <li>
          <a
            className="tooltip tooltip-bottom"
            data-tip="Fetch history"
            onClick={onShowHistory}
          >
            <FontAwesomeIcon icon={faClockRotateLeft} />
          </a>
        </li>
        <li>
          <a
            className="tooltip tooltip-bottom"
            data-tip="Mark all read"
            onClick={onMarkAllRead}
          >
            <FontAwesomeIcon icon={faCircleCheck} />
          </a>
        </li>
        <li>
          <a
            className="tooltip tooltip-bottom text-error"
            data-tip="Unsubscribe"
            onClick={onUnsubscribe}
          >
            <FontAwesomeIcon icon={faTrash} />
          </a>
        </li>
      </ul>
    </div>
  );
}

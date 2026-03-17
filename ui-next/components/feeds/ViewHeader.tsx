"use client";

import type { FeedResponse } from "@/lib/queries";
import {
  faBookmark,
  faCircleCheck,
  faClockRotateLeft,
  faPencil,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import RenameFeedForm from "./RenameFeedForm";

interface NavProps {
  feed: FeedResponse;
  onShowHistory: () => void;
  onMarkAllRead: () => void;
  onUnsubscribe: () => void;
  onShowReadHistory?: () => void;
  onlySaved?: boolean;
  onToggleSaved?: () => void;
}

export default function ViewHeader({
  feed,
  onShowHistory,
  onMarkAllRead,
  onUnsubscribe,
  onlySaved,
  onToggleSaved,
}: NavProps) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="navbar bg-base-100 px-4">
      {/* Left side: Title/Name */}
      <div className="flex-1 min-w-0 flex items-center gap-1">
        {renaming ? (
          <RenameFeedForm feed={feed} onDone={() => setRenaming(false)} />
        ) : (
          <span className="truncate">{feed.name ?? feed.url}</span>
        )}
      </div>

      {/* Right side: Actions */}
      <div className="flex-none flex items-center gap-1">
        {/* Saved filter toggle */}
        {onToggleSaved !== undefined && (
          <div
            className="tooltip tooltip-bottom"
            data-tip={onlySaved ? "Show all articles" : "Show saved only"}
          >
            <button
              className={`btn btn-sm btn-circle ${
                onlySaved ? "btn-primary" : "btn-ghost"
              }`}
              onClick={onToggleSaved}
            >
              <FontAwesomeIcon icon={faBookmark} />
            </button>
          </div>
        )}

        {/* Mark All Read Button */}
        <div className="tooltip tooltip-bottom" data-tip="Mark all read">
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onMarkAllRead}
          >
            <FontAwesomeIcon icon={faCircleCheck} />
          </button>
        </div>

        {/* Settings Dropdown */}
        <div className="dropdown dropdown-end">
          <details>
            <summary className="btn btn-ghost btn-sm btn-circle list-none">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
                <path fillRule="evenodd" d="M10.5 6a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm0 6a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm0 6a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" clipRule="evenodd" />
              </svg>
            </summary>
            <ul className="dropdown-content menu p-2 shadow bg-base-200 rounded-box w-52 z-[1] mt-2">
              <li>
                <button onClick={() => setRenaming(true)}>
                  <FontAwesomeIcon icon={faPencil} />
                  Rename
                </button>
              </li>
              <li>
                <button onClick={onShowHistory}>
                  <FontAwesomeIcon icon={faClockRotateLeft} />
                  Fetch History
                </button>
              </li>
              <li>
                <button onClick={onUnsubscribe} className="text-error">
                  <FontAwesomeIcon icon={faTrash} />
                  Unsubscribe
                </button>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}

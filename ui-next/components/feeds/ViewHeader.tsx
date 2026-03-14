"use client";

import type { FeedResponse } from "@/lib/queries";
import {
  faCircleCheck,
  faClockRotateLeft,
  faGear,
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
    <div className="navbar bg-base-100 px-4">
      {/* Left side: Title/Name */}
      <div className="flex-1 min-w-0">
        <span className="truncate">{feed.name ?? feed.url}</span>
      </div>

      {/* Right side: Actions */}
      <div className="flex-none flex items-center gap-1">
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
          <div
            tabIndex={0}
            role="button"
            className="btn btn-ghost btn-sm btn-circle"
          >
            <FontAwesomeIcon icon={faGear} />
          </div>
          <ul
            tabIndex={0}
            className="dropdown-content menu p-2 shadow bg-base-200 rounded-box w-52 z-[1] mt-2"
          >
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
        </div>
      </div>
    </div>
  );
}

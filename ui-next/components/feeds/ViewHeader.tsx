"use client";

import type { FeedResponse } from "@/lib/queries";
import type { Density, TextSize } from "@/lib/useViewPreferences";
import {
  faBookmark,
  faCircleCheck,
  faClockRotateLeft,
  faPencil,
  faTableCells,
  faTableList,
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
  viewMode?: string;
  onViewModeChange?: (mode: string) => void;
  density?: Density;
  onDensityChange?: (d: Density) => void;
  textSize?: TextSize;
  onTextSizeChange?: (s: TextSize) => void;
}

export default function ViewHeader({
  feed,
  onShowHistory,
  onMarkAllRead,
  onUnsubscribe,
  onlySaved,
  onToggleSaved,
  viewMode = "list",
  onViewModeChange,
  density = "default",
  onDensityChange,
  textSize = "base",
  onTextSizeChange,
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
        {/* Combined appearance + layout dropdown */}
        {(onViewModeChange || onTextSizeChange || onDensityChange) && (
          <div className="dropdown dropdown-end">
            <details>
              <summary className="btn btn-ghost btn-sm list-none px-2 font-bold">
                Aa
              </summary>
              <div className="dropdown-content bg-base-200 rounded-box shadow p-3 w-56 z-[1] mt-2 flex flex-col gap-4">
                {/* Layout group */}
                {onViewModeChange && (
                  <div>
                    <p className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-1.5">
                      Layout
                    </p>
                    <div className="join w-full">
                      <button
                        className={`btn btn-xs join-item flex-1 gap-1 ${viewMode === "list" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => onViewModeChange("list")}
                      >
                        <FontAwesomeIcon icon={faTableList} /> List
                      </button>
                      <button
                        className={`btn btn-xs join-item flex-1 gap-1 ${viewMode === "cards" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => onViewModeChange("cards")}
                      >
                        <FontAwesomeIcon icon={faTableCells} /> Cards
                      </button>
                      <button
                        className={`btn btn-xs join-item flex-1 gap-1 ${viewMode === "magazine" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => onViewModeChange("magazine")}
                      >
                        <FontAwesomeIcon icon={faTableList} /> Mag
                      </button>
                    </div>
                  </div>
                )}
                {/* Text size group */}
                {onTextSizeChange && (
                  <div>
                    <p className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-1.5">
                      Text
                    </p>
                    <div className="join w-full">
                      {(["sm", "base", "lg"] as TextSize[]).map((s) => (
                        <button
                          key={s}
                          className={`btn btn-xs join-item flex-1 ${textSize === s ? "btn-primary" : "btn-ghost"}`}
                          onClick={() => onTextSizeChange(s)}
                        >
                          {s === "sm"
                            ? "Small"
                            : s === "base"
                              ? "Medium"
                              : "Large"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Density group */}
                {onDensityChange && (
                  <div>
                    <p className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-1.5">
                      Density
                    </p>
                    <div className="join w-full">
                      {(["compact", "default", "cozy"] as Density[]).map(
                        (d) => (
                          <button
                            key={d}
                            className={`btn btn-xs join-item flex-1 ${density === d ? "btn-primary" : "btn-ghost"}`}
                            onClick={() => onDensityChange(d)}
                          >
                            {d === "compact"
                              ? "Compact"
                              : d === "default"
                                ? "Normal"
                                : "Cozy"}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-4"
              >
                <path
                  fillRule="evenodd"
                  d="M10.5 6a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm0 6a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm0 6a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
                  clipRule="evenodd"
                />
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

"use client";

import type { FeedResponse } from "@/lib/queries";
import type { Density, TextSize } from "@/lib/useViewPreferences";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import FeedHeaderSettings from "./FeedHeaderSettings";
import FeedHeaderTitle from "./FeedHeaderTitle";
import FolderHeaderAppearance from "./FolderHeaderAppearance";
import FolderHeaderSavedToggle from "./FolderHeaderSavedToggle";

interface NavProps {
  feed: FeedResponse;
  onShowHistory: () => void;
  onMarkAllRead: () => void;
  onUnsubscribe: () => void;
  onlySaved?: boolean;
  onToggleSaved?: () => void;
  onlyUnread?: boolean;
  onToggleUnread?: () => void;
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
  onlyUnread,
  onToggleUnread,
  viewMode = "list",
  onViewModeChange,
  density = "default",
  onDensityChange,
  textSize = "base",
  onTextSizeChange,
}: NavProps) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="flex items-center gap-1 bg-base-100 border-b border-base-300 px-2 py-1 min-h-0">
      <FeedHeaderTitle
        feed={feed}
        renaming={renaming}
        onDoneRename={() => setRenaming(false)}
      />

      <div className="flex-none flex items-center gap-1">
        <FolderHeaderAppearance
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          density={density}
          onDensityChange={onDensityChange}
          textSize={textSize}
          onTextSizeChange={onTextSizeChange}
          onlyUnread={onlyUnread}
          onToggleUnread={onToggleUnread}
        />

        <FolderHeaderSavedToggle
          onlySaved={onlySaved}
          onToggleSaved={onToggleSaved}
        />

        <div className="tooltip tooltip-bottom" data-tip="Mark all read">
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onMarkAllRead}
          >
            <FontAwesomeIcon icon={faCircleCheck} />
          </button>
        </div>

        <FeedHeaderSettings
          onStartRename={() => setRenaming(true)}
          onShowHistory={onShowHistory}
          onUnsubscribe={onUnsubscribe}
        />
      </div>
    </div>
  );
}

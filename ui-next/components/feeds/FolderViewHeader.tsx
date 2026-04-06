"use client";

import type { FolderResponse } from "@/lib/queries";
import type { Density, TextSize } from "@/lib/useViewPreferences";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FolderHeaderAppearance from "./FolderHeaderAppearance";
import FolderHeaderSavedToggle from "./FolderHeaderSavedToggle";

interface FolderViewHeaderProps {
  folder: FolderResponse;
  onMarkAllRead: () => void;
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

export default function FolderViewHeader({
  folder,
  onMarkAllRead,
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
}: FolderViewHeaderProps) {
  return (
    <div className="flex items-center gap-1 bg-base-100 border-b border-base-300 px-2 py-1 min-h-0">
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="truncate text-sm font-medium">{folder.name}</span>
      </div>
      <div className="flex-none flex items-center gap-1">
        <FolderHeaderAppearance
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          density={density}
          onDensityChange={onDensityChange}
          textSize={textSize}
          onTextSizeChange={onTextSizeChange}
        />

        <FolderHeaderSavedToggle
          onlySaved={onlySaved}
          onToggleSaved={onToggleSaved}
        />

        <FolderHeaderSavedToggle
          onlySaved={onlyUnread}
          onToggleSaved={onToggleUnread}
          icon="unread"
          activeLabel="Show all articles"
          inactiveLabel="Show unread only"
        />

        {/* Mark all read */}
        <div className="tooltip tooltip-bottom" data-tip="Mark all read">
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onMarkAllRead}
          >
            <FontAwesomeIcon icon={faCircleCheck} />
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import type { FeedResponse, FolderResponse } from "@/lib/queries";
import type { Verifications } from "@/lib/usePendingVerifications";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  faChevronDown,
  faChevronRight,
  faFolder,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import FeedListItem from "./FeedListItem";

interface Props {
  folder: FolderResponse;
  feeds: FeedResponse[];
  isSelected: boolean;
  selectedFeed: FeedResponse | null;
  onSelectFolder: (folder: FolderResponse | null) => void;
  onSelectFeed: (feed: FeedResponse | null) => void;
  verifications: Verifications;
  onRemoveVerification: (id: number) => void;
}

export default function FolderSection({
  folder,
  feeds,
  isSelected,
  selectedFeed,
  onSelectFolder,
  onSelectFeed,
  verifications,
  onRemoveVerification,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const hasUnread = folder.unread_count > 0;

  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `folder-${folder.id}`,
  });

  return (
    <li ref={setDropRef}>
      <div
        className={`flex items-center gap-2 px-2 py-1 rounded-btn cursor-pointer transition-colors ${isSelected ? "active" : ""} ${isOver ? "bg-primary/20 ring-1 ring-primary" : ""}`}
        onClick={() => onSelectFolder(isSelected ? null : folder)}
      >
        <button
          className="shrink-0 opacity-50 hover:opacity-100 p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-label={expanded ? "Collapse folder" : "Expand folder"}
        >
          <FontAwesomeIcon
            icon={expanded ? faChevronDown : faChevronRight}
            className="text-xs"
          />
        </button>
        <FontAwesomeIcon
          icon={faFolder}
          className={`shrink-0 text-sm ${isOver ? "text-primary" : hasUnread ? "text-primary" : "opacity-60"}`}
        />
        <span className="overflow-hidden min-w-0 flex-1 truncate">
          {folder.name}
        </span>
        {isOver && (
          <span className="text-xs text-primary opacity-70 shrink-0">
            Drop here
          </span>
        )}
        {!isOver && hasUnread && (
          <span className="badge badge-primary badge-sm shrink-0 ml-auto">
            {folder.unread_count > 99 ? "99+" : folder.unread_count}
          </span>
        )}
      </div>

      {expanded && feeds.length > 0 && (
        <ul className="menu menu-sm pl-4 gap-0.5">
          <SortableContext
            items={feeds.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {feeds.map((feed) => (
              <FeedListItem
                key={feed.id}
                feed={feed}
                isSelected={selectedFeed?.id === feed.id}
                onSelectFeed={onSelectFeed}
                taskId={verifications[feed.id] ?? null}
                onRemoveVerification={onRemoveVerification}
              />
            ))}
          </SortableContext>
        </ul>
      )}

      {expanded && feeds.length === 0 && (
        <p
          className={`px-8 py-1 text-xs ${isOver ? "text-primary" : "opacity-40"}`}
        >
          {isOver ? "Release to add" : "No feeds"}
        </p>
      )}
    </li>
  );
}

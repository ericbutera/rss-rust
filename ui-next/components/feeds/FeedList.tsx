"use client";

import { API_URL } from "@/lib/config";
import {
  useAssignFeedToFolder,
  useFeeds,
  useFolders,
  useReorderFeeds,
  type FeedResponse,
  type FolderResponse,
} from "@/lib/queries";
import type { Verifications } from "@/lib/usePendingVerifications";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  faChevronDown,
  faChevronRight,
  faFolder,
  faLinkSlash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import FeedListItem from "./FeedListItem";
import FolderSection from "./FolderSection";

interface FeedListProps {
  selectedFeed: FeedResponse | null;
  selectedFolderId: number | null;
  onSelectFeed: (feed: FeedResponse | null) => void;
  onSelectFolder: (folder: FolderResponse | null) => void;
  verifications: Verifications;
  onRemoveVerification: (feedId: number) => void;
}

// Droppable zone for ungrouped feeds (allows dragging feeds OUT of folders)
function UngroupedDropZone({ isVisible }: { isVisible: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: "ungrouped" });
  if (!isVisible) return null;
  return (
    <li ref={setNodeRef}>
      <div
        className={`px-2 py-1 text-xs rounded-btn transition-colors ${isOver ? "bg-primary/20 ring-1 ring-primary text-primary" : "opacity-40"}`}
      >
        {isOver ? "Release to ungroup" : "── Ungrouped ──"}
      </div>
    </li>
  );
}

export default function FeedList({
  selectedFeed,
  selectedFolderId,
  onSelectFeed,
  onSelectFolder,
  verifications,
  onRemoveVerification: removeVerification,
}: FeedListProps) {
  const { data: feeds, isLoading: feedsLoading } = useFeeds();
  const { data: folders, isLoading: foldersLoading } = useFolders();
  const { mutateAsync: reorderFeeds } = useReorderFeeds();
  const { mutateAsync: assignFeedToFolder } = useAssignFeedToFolder();

  const isLoading = feedsLoading || foldersLoading;

  const ungroupedFeeds = feeds.filter((f) => !f.folder_id);
  const feedsByFolder = (folderId: number) =>
    feeds.filter((f) => f.folder_id === folderId);

  const [localFeeds, setLocalFeeds] = useState<FeedResponse[] | null>(null);
  const displayUngrouped = localFeeds ?? ungroupedFeeds;

  // Track which feed is being dragged (for DragOverlay)
  const [activeFeed, setActiveFeed] = useState<FeedResponse | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(TouchSensor, {
      // Long hold required on touch so normal scroll gestures pass through.
      activationConstraint: { delay: 500, tolerance: 8 },
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    const feed = feeds.find((f) => f.id === event.active.id);
    setActiveFeed(feed ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveFeed(null);
    if (!over || active.id === over.id) return;

    const feedId = active.id as number;

    // Dropped on a folder → assign feed to that folder
    if (typeof over.id === "string" && over.id.startsWith("folder-")) {
      const folderId = Number(over.id.replace("folder-", ""));
      const draggedFeed = feeds.find((f) => f.id === feedId);
      if (!draggedFeed || draggedFeed.folder_id === folderId) return;
      await assignFeedToFolder(feedId, folderId);
      return;
    }

    // Dropped on the ungrouped zone → remove from folder
    if (over.id === "ungrouped") {
      const draggedFeed = feeds.find((f) => f.id === feedId);
      if (!draggedFeed || draggedFeed.folder_id === null) return;
      await assignFeedToFolder(feedId, null);
      return;
    }

    // Dropped on another ungrouped feed → reorder
    const oldIndex = displayUngrouped.findIndex((f) => f.id === active.id);
    const newIndex = displayUngrouped.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(displayUngrouped, oldIndex, newIndex);
    setLocalFeeds(reordered);

    try {
      await reorderFeeds(
        reordered.map((f, i) => ({ feed_id: f.id, sort_order: i })),
      );
    } finally {
      setLocalFeeds(null);
    }
  }

  if (isLoading) {
    return (
      <ul className="menu menu-sm w-full">
        <li>
          <span className="loading loading-spinner loading-xs" />
        </li>
      </ul>
    );
  }

  if (feeds.length === 0 && folders.length === 0) {
    return (
      <ul className="menu menu-sm w-full">
        <li>
          <span className="text-xs opacity-50 flex items-center gap-2">
            <FontAwesomeIcon icon={faLinkSlash} />
            No feeds yet
          </span>
        </li>
      </ul>
    );
  }

  const hasFolders = folders.length > 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <ul className="menu menu-sm w-full p-0 gap-0.5">
        {/* Folders with their feeds */}
        {folders.map((folder) => (
          <FolderSection
            key={folder.id}
            folder={folder}
            feeds={feedsByFolder(folder.id)}
            isSelected={selectedFolderId === folder.id}
            selectedFeed={selectedFeed}
            onSelectFolder={onSelectFolder}
            onSelectFeed={onSelectFeed}
            verifications={verifications}
            onRemoveVerification={removeVerification}
          />
        ))}

        {/* Drop zone label when folders exist */}
        <UngroupedDropZone
          isVisible={hasFolders && feeds.some((f) => !!f.folder_id)}
        />

        {/* Ungrouped feeds with drag-to-reorder */}
        {displayUngrouped.length > 0 && (
          <SortableContext
            items={displayUngrouped.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {displayUngrouped.map((feed) => (
              <FeedListItem
                key={feed.id}
                feed={feed}
                isSelected={selectedFeed?.id === feed.id}
                onSelectFeed={onSelectFeed}
                taskId={verifications[feed.id] ?? null}
                onRemoveVerification={removeVerification}
              />
            ))}
          </SortableContext>
        )}
      </ul>

      {/* Ghost image while dragging */}
      <DragOverlay>
        {activeFeed && (
          <div className="bg-base-200 rounded-btn px-2 py-1 text-sm shadow-lg opacity-90">
            {activeFeed.name ?? activeFeed.url}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

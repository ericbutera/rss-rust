"use client";

import { useFeeds, useReorderFeeds, type FeedResponse } from "@/lib/queries";
import { usePendingVerifications } from "@/lib/usePendingVerifications";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faGripVertical,
  faLinkSlash,
  faRss,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import VerificationIndicator from "./VerificationIndicator";

interface FeedListProps {
  selectedFeed: FeedResponse | null;
  onSelectFeed: (feed: FeedResponse | null) => void;
}

interface SortableFeedItemProps {
  feed: FeedResponse;
  isSelected: boolean;
  onSelectFeed: (feed: FeedResponse | null) => void;
  taskId: string | null;
  onRemoveVerification: (id: number) => void;
}

function SortableFeedItem({
  feed,
  isSelected,
  onSelectFeed,
  taskId,
  onRemoveVerification,
}: SortableFeedItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feed.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const label =
    feed.name ??
    (() => {
      try {
        return new URL(feed.url).hostname;
      } catch {
        return feed.url || "Unknown feed";
      }
    })();
  const hasUnread = feed.unread_count > 0;

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`tooltip tooltip-right group flex items-center gap-2 px-2 py-1 rounded-btn cursor-pointer ${isSelected ? "active" : ""}`}
        data-tip={label}
        onClick={() => onSelectFeed(isSelected ? null : feed)}
      >
        <button
          className="shrink-0 cursor-grab active:cursor-grabbing touch-none opacity-30 hover:opacity-70 p-0.5"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <FontAwesomeIcon icon={faGripVertical} className="text-xs" />
        </button>
        <FontAwesomeIcon
          icon={faRss}
          className={`shrink-0 ${hasUnread ? "text-primary" : "opacity-60"}`}
        />
        <div className="overflow-hidden min-w-0 flex-1">
          <span className="whitespace-nowrap block">{label}</span>
        </div>
        {taskId && (
          <VerificationIndicator
            feed={feed}
            taskId={taskId}
            onDone={() => onRemoveVerification(feed.id)}
          />
        )}
        {hasUnread && (
          <span className="badge badge-primary badge-sm shrink-0 ml-auto">
            {feed.unread_count > 99 ? "99+" : feed.unread_count}
          </span>
        )}
      </div>
    </li>
  );
}

export default function FeedList({
  selectedFeed,
  onSelectFeed,
}: FeedListProps) {
  const { data: feeds, isLoading } = useFeeds();
  const { mutateAsync: reorderFeeds } = useReorderFeeds();
  const { verifications, remove: removeVerification } =
    usePendingVerifications();

  // Local copy for optimistic reordering
  const [localFeeds, setLocalFeeds] = useState<FeedResponse[] | null>(null);
  const displayFeeds = localFeeds ?? feeds;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = displayFeeds.findIndex((f) => f.id === active.id);
    const newIndex = displayFeeds.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(displayFeeds, oldIndex, newIndex);
    setLocalFeeds(reordered);

    try {
      await reorderFeeds(
        reordered.map((f, i) => ({ feed_id: f.id, sort_order: i })),
      );
    } finally {
      setLocalFeeds(null);
    }
  }

  return (
    <>
      {isLoading && (
        <ul className="menu menu-sm w-full">
          <li>
            <span className="loading loading-spinner loading-xs" />
          </li>
        </ul>
      )}
      {!isLoading && feeds.length === 0 && (
        <ul className="menu menu-sm w-full">
          <li>
            <span className="text-xs opacity-50 flex items-center gap-2">
              <FontAwesomeIcon icon={faLinkSlash} />
              No feeds yet
            </span>
          </li>
        </ul>
      )}
      {!isLoading && feeds.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayFeeds.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="menu menu-sm w-full gap-0.5">
              {displayFeeds.map((feed) => (
                <SortableFeedItem
                  key={feed.id}
                  feed={feed}
                  isSelected={selectedFeed?.id === feed.id}
                  onSelectFeed={onSelectFeed}
                  taskId={verifications[feed.id] ?? null}
                  onRemoveVerification={removeVerification}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}

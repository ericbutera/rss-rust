"use client";

import type { FeedResponse } from "@/lib/queries";
import { useRenameFeed } from "@/lib/queries";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";

interface RenameFeedFormProps {
  feed: FeedResponse;
  onDone: () => void;
}

export default function RenameFeedForm({ feed, onDone }: RenameFeedFormProps) {
  const { mutateAsync: renameFeed, isPending } = useRenameFeed();
  const [draftName, setDraftName] = useState(feed.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function commit() {
    const trimmed = draftName.trim();
    await renameFeed(feed.id, trimmed || null);
    onDone();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") onDone();
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        ref={inputRef}
        className="input input-sm input-bordered flex-1 min-w-0"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={feed.url}
        disabled={isPending}
      />
      <button
        className="btn btn-ghost btn-sm btn-circle text-success"
        onClick={commit}
        disabled={isPending}
        title="Save name"
      >
        <FontAwesomeIcon icon={faCheck} />
      </button>
      <button
        className="btn btn-ghost btn-sm btn-circle"
        onClick={onDone}
        disabled={isPending}
        title="Cancel"
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}

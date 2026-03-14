"use client";

import { type FeedResponse } from "@/lib/queries";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import AddFeedForm from "./AddFeedForm";
import FeedList from "./FeedList";

interface MenuProps {
  selectedFeed: FeedResponse | null;
  onSelectFeed: (feed: FeedResponse | null) => void;
}

export default function Menu({ selectedFeed, onSelectFeed }: MenuProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="flex flex-col h-full p-2">
      <div className="flex items-center justify-between px-2 py-3">
        <span className="font-bold text-sm uppercase tracking-wide opacity-60">
          Feeds
        </span>
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => setShowAddForm((v) => !v)}
          title="Subscribe to a feed"
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </div>

      {showAddForm && <AddFeedForm onClose={() => setShowAddForm(false)} />}

      <FeedList selectedFeed={selectedFeed} onSelectFeed={onSelectFeed} />
    </div>
  );
}

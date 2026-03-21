"use client";

import { type FeedResponse, type FolderResponse } from "@/lib/queries";
import { usePendingVerifications } from "@/lib/usePendingVerifications";
import { faFolder, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import AddFeedForm from "./AddFeedForm";
import CreateFolderForm from "./CreateFolderForm";
import FeedList from "./FeedList";

interface MenuProps {
  selectedFeed: FeedResponse | null;
  selectedFolderId: number | null;
  onSelectFeed: (feed: FeedResponse | null) => void;
  onSelectFolder: (folder: FolderResponse | null) => void;
}

export default function Menu({
  selectedFeed,
  selectedFolderId,
  onSelectFeed,
  onSelectFolder,
}: MenuProps) {
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const {
    verifications,
    add: addVerification,
    remove: removeVerification,
  } = usePendingVerifications();

  return (
    <div className="flex flex-col h-full p-2">
      <div className="flex items-center justify-between px-2 py-3">
        <span className="font-bold text-sm uppercase tracking-wide opacity-60">
          Feeds
        </span>
        <div className="flex items-center gap-1">
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => {
              setShowAddFolder((v) => !v);
              setShowAddFeed(false);
            }}
            title="Create a folder"
          >
            <FontAwesomeIcon icon={faFolder} />
          </button>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => {
              setShowAddFeed((v) => !v);
              setShowAddFolder(false);
            }}
            title="Subscribe to a feed"
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
      </div>

      {showAddFeed && (
        <AddFeedForm
          onClose={() => setShowAddFeed(false)}
          onVerificationAdded={addVerification}
        />
      )}

      {showAddFolder && (
        <CreateFolderForm onClose={() => setShowAddFolder(false)} />
      )}

      <div className="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <FeedList
          selectedFeed={selectedFeed}
          selectedFolderId={selectedFolderId}
          onSelectFeed={onSelectFeed}
          onSelectFolder={onSelectFolder}
          verifications={verifications}
          onRemoveVerification={removeVerification}
        />
      </div>
    </div>
  );
}

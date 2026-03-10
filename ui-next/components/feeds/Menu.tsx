"use client";

import {
  faClockRotateLeft,
  faLinkSlash,
  faPlus,
  faRss,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import {
  useCreateFeed,
  useFeeds,
  type FeedResponse,
} from "../../src/lib/queries";
import { usePendingVerifications } from "../../src/lib/usePendingVerifications";
import FetchHistoryModal from "./FetchHistoryModal";
import VerificationIndicator from "./VerificationIndicator";

interface MenuProps {
  selectedFeedId: number | null;
  onSelectFeed: (id: number | null) => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function Menu({ selectedFeedId, onSelectFeed }: MenuProps) {
  const { data: feeds, isLoading } = useFeeds();
  const { mutateAsync: createFeed, isPending } = useCreateFeed();
  const {
    verifications,
    add: addVerification,
    remove: removeVerification,
  } = usePendingVerifications();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [historyFeed, setHistoryFeed] = useState<FeedResponse | null>(null);

  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await createFeed({
        url: newUrl,
        name: newName || undefined,
      });
      if (result.task_id) {
        addVerification(result.feed.id, result.task_id);
      }
      setNewUrl("");
      setNewName("");
      setShowAddForm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add feed";
      setError(msg);
    }
  }

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

      {/* Add feed form */}
      {showAddForm && (
        <form
          onSubmit={handleAddFeed}
          className="px-2 pb-3 flex flex-col gap-1"
        >
          <input
            className="input input-bordered input-sm w-full"
            type="url"
            placeholder="https://example.com/feed.xml"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            required
          />
          <input
            className="input input-bordered input-sm w-full"
            type="text"
            placeholder="Name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          {error && <p className="text-error text-xs">{error}</p>}
          <div className="flex gap-1">
            <button
              type="submit"
              className="btn btn-primary btn-sm flex-1"
              disabled={isPending}
            >
              {isPending ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setShowAddForm(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Feed list */}
      <ul className="menu menu-sm w-full gap-0.5">
        {isLoading && (
          <li>
            <span className="loading loading-spinner loading-xs" />
          </li>
        )}
        {!isLoading && feeds.length === 0 && (
          <li>
            <span className="text-xs opacity-50 flex items-center gap-2">
              <FontAwesomeIcon icon={faLinkSlash} />
              No feeds yet
            </span>
          </li>
        )}
        {feeds.map((feed: FeedResponse) => {
          const tooltipText = `Subscribed: ${formatDate(feed.subscribed_at)}\nLast fetched: ${formatDate(feed.last_fetched_at)}`;
          const taskId = verifications[feed.id];
          return (
            <li key={feed.id}>
              <div className="flex items-center gap-0 group">
                <div
                  className="tooltip tooltip-bottom flex-1 min-w-0"
                  data-tip={tooltipText}
                >
                  <a
                    className={`flex items-center gap-2 w-full ${selectedFeedId === feed.id ? "active" : ""}`}
                    onClick={() =>
                      onSelectFeed(selectedFeedId === feed.id ? null : feed.id)
                    }
                  >
                    <FontAwesomeIcon
                      icon={faRss}
                      className="shrink-0 opacity-60"
                    />
                    <span className="truncate flex-1">
                      {feed.name ?? new URL(feed.url).hostname}
                    </span>
                    {taskId && (
                      <VerificationIndicator
                        feed={feed}
                        taskId={taskId}
                        onDone={() => removeVerification(feed.id)}
                      />
                    )}
                    {feed.unread_count > 0 && (
                      <span className="badge badge-primary badge-sm shrink-0">
                        {feed.unread_count}
                      </span>
                    )}
                  </a>
                </div>
                <button
                  className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-60 shrink-0"
                  title="Fetch history"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryFeed(feed);
                  }}
                >
                  <FontAwesomeIcon icon={faClockRotateLeft} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {historyFeed && (
        <FetchHistoryModal
          feedId={historyFeed.id}
          feedName={historyFeed.name ?? new URL(historyFeed.url).hostname}
          onClose={() => setHistoryFeed(null)}
        />
      )}
    </div>
  );
}

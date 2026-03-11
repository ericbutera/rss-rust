"use client";

import {
  useAdminFeedHistory,
  useAdminFeeds,
  useUpdateAdminFeed,
  type AdminFeed,
  type FetchHistoryPage,
  type FetchHistoryResponse,
} from "@/lib/queries";
import { Pagination } from "@ericbutera/kaleido";
import { useEffect, useRef, useState } from "react";

const INTERVAL_OPTIONS = [
  { label: "Every 30 minutes", value: 30 },
  { label: "Hourly", value: 60 },
  { label: "Every 6 hours", value: 360 },
  { label: "Every 12 hours", value: 720 },
  { label: "Daily", value: 1440 },
  { label: "Weekly", value: 10080 },
];

function formatInterval(minutes: number): string {
  const opt = INTERVAL_OPTIONS.find((o) => o.value === minutes);
  if (opt) return opt.label;
  if (minutes < 60) return `Every ${minutes}m`;
  if (minutes < 1440) return `Every ${minutes / 60}h`;
  return `Every ${minutes / 1440}d`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusBadge(code: number | null | undefined) {
  if (code == null)
    return <span className="badge badge-ghost badge-sm">—</span>;
  if (code === 304)
    return <span className="badge badge-info badge-sm">{code}</span>;
  if (code >= 200 && code < 300)
    return <span className="badge badge-success badge-sm">{code}</span>;
  return <span className="badge badge-error badge-sm">{code}</span>;
}

function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function HistoryModal({
  feed,
  onClose,
}: {
  feed: AdminFeed;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);

  const { data: rawData, isLoading } = useAdminFeedHistory(feed.id, page);
  const historyPage = rawData as FetchHistoryPage | undefined;
  const history: FetchHistoryResponse[] = historyPage?.data ?? [];
  const metadata = historyPage?.metadata;
  const total = metadata?.total ?? 0;
  const perPage = metadata?.per_page ?? 20;
  const totalPages = metadata?.total_pages ?? 1;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box max-w-3xl">
        <h3 className="font-bold text-lg mb-1">Fetch History</h3>
        <p className="text-sm text-base-content/60 mb-4">
          {feed.name ?? feed.url}
        </p>

        {isLoading ? (
          <div className="flex justify-center p-4">
            <span className="loading loading-spinner" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-center py-6 text-base-content/50">
            No fetch history yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Fetched</th>
                  <th>Status</th>
                  <th className="text-right">Articles</th>
                  <th className="text-right">Size</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="text-xs">{formatDate(h.fetched_at)}</td>
                    <td>{statusBadge(h.status_code)}</td>
                    <td className="text-right text-xs">
                      {h.article_count ?? "—"}
                    </td>
                    <td className="text-right text-xs">
                      {formatBytes(h.content_length)}
                    </td>
                    <td className="text-xs text-error max-w-xs truncate">
                      {h.error_message ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            page={page}
            perPage={perPage}
            total={total}
            onPageChange={setPage}
            className="mt-3"
          />
        )}

        <div className="modal-action">
          <form method="dialog">
            <button className="btn btn-sm">Close</button>
          </form>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}

function EditModal({
  feed,
  onClose,
  onSaved,
}: {
  feed: AdminFeed;
  onClose: () => void;
  onSaved: (updated: AdminFeed) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [enabled, setEnabled] = useState(feed.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState(
    feed.fetch_interval_minutes,
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useUpdateAdminFeed();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await mutation.mutateAsync({
        params: { path: { id: feed.id } },
        body: { enabled, fetch_interval_minutes: intervalMinutes },
      });
      onSaved(result as AdminFeed);
      dialogRef.current?.close();
    } catch {
      setError("Failed to update feed. Please try again.");
    }
  }

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-1">Edit Feed</h3>
        <p className="text-sm text-base-content/60 mb-4 truncate">
          {feed.name ?? feed.url}
        </p>

        <form onSubmit={handleSubmit}>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Fetch Settings</legend>

            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="feed-enabled"
                className="toggle toggle-success"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <label htmlFor="feed-enabled" className="cursor-pointer">
                {enabled ? "Enabled" : "Disabled"}
              </label>
            </div>

            <label className="label" htmlFor="feed-interval">
              Fetch interval
            </label>
            <select
              id="feed-interval"
              className="select select-bordered w-full"
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              disabled={!enabled}
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </fieldset>

          {error && (
            <div role="alert" className="alert alert-error mt-4">
              {error}
            </div>
          )}

          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}

export default function AdminFeedsPanel() {
  const [historyFeed, setHistoryFeed] = useState<AdminFeed | null>(null);
  const [editFeed, setEditFeed] = useState<AdminFeed | null>(null);
  const [feedList, setFeedList] = useState<AdminFeed[]>([]);

  const { data: feeds = [], isLoading, isError } = useAdminFeeds();

  useEffect(() => {
    setFeedList(feeds as AdminFeed[]);
  }, [feeds]);

  function handleSaved(updated: AdminFeed) {
    setFeedList((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    setEditFeed(updated);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="alert alert-error">
        Failed to load feeds.
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">All Feeds ({feedList.length})</h2>

      <div className="overflow-x-auto">
        <table className="table table-zebra table-sm">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name / URL</th>
              <th className="text-right">Articles</th>
              <th>Interval</th>
              <th>Status</th>
              <th>Verified</th>
              <th>Created</th>
              <th>Last Fetched</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {feedList.map((feed) => (
              <tr key={feed.id} className="hover">
                <td className="font-mono text-xs">{feed.id}</td>
                <td>
                  <div className="font-semibold">{feed.name ?? "—"}</div>
                  <div className="text-xs text-base-content/60 truncate max-w-xs">
                    {feed.url}
                  </div>
                </td>
                <td className="text-right">{feed.article_count}</td>
                <td className="text-xs">
                  {formatInterval(feed.fetch_interval_minutes)}
                </td>
                <td>
                  {feed.enabled ? (
                    <span className="badge badge-success badge-sm">Active</span>
                  ) : (
                    <span className="badge badge-ghost badge-sm">Disabled</span>
                  )}
                </td>
                <td className="text-xs">
                  {feed.verified_at ? (
                    <span className="badge badge-success badge-sm">Yes</span>
                  ) : (
                    <span className="badge badge-ghost badge-sm">No</span>
                  )}
                </td>
                <td className="text-xs">{formatDate(feed.created_at)}</td>
                <td className="text-xs">{formatDate(feed.last_fetched_at)}</td>
                <td>
                  <div className="flex gap-1">
                    <button
                      className="btn btn-xs btn-primary"
                      onClick={() => setEditFeed(feed)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => setHistoryFeed(feed)}
                    >
                      History
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {historyFeed && (
        <HistoryModal feed={historyFeed} onClose={() => setHistoryFeed(null)} />
      )}

      {editFeed && (
        <EditModal
          feed={editFeed}
          onClose={() => setEditFeed(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

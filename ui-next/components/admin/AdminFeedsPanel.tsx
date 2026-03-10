"use client";

import { useEffect, useRef, useState } from "react";
import type { components } from "../../src/lib/openapi/react-query/api";
import { $api } from "../../src/lib/queries";

type AdminFeed = components["schemas"]["AdminFeedResponse"];
type FetchHistory = components["schemas"]["FetchHistoryResponse"];

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

  // TODO: this should use a function in queries.ts, move there, follow existing patterns!
  const { data, isLoading } = $api.useQuery(
    "get",
    "/admin/feeds/{id}/fetch-history",
    { params: { path: { id: feed.id } } },
  );

  const history: FetchHistory[] = (data as FetchHistory[] | undefined) ?? [];

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

export default function AdminFeedsPanel() {
  const [historyFeed, setHistoryFeed] = useState<AdminFeed | null>(null);

  const {
    data: feeds = [],
    isLoading,
    isError,
  } = $api.useQuery("get", "/admin/feeds", {});

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
      <h2 className="text-xl font-bold mb-4">All Feeds ({feeds.length})</h2>

      <div className="overflow-x-auto">
        <table className="table table-zebra table-sm">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name / URL</th>
              <th className="text-right">Articles</th>
              <th>Last Fetched</th>
              <th>Verified</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed) => (
              <tr key={feed.id} className="hover">
                <td className="font-mono text-xs">{feed.id}</td>
                <td>
                  <div className="font-semibold">{feed.name ?? "—"}</div>
                  <div className="text-xs text-base-content/60 truncate max-w-xs">
                    {feed.url}
                  </div>
                </td>
                <td className="text-right">{feed.article_count}</td>
                <td className="text-xs">{formatDate(feed.last_fetched_at)}</td>
                <td className="text-xs">
                  {feed.verified_at ? (
                    <span className="badge badge-success badge-sm">Yes</span>
                  ) : (
                    <span className="badge badge-ghost badge-sm">No</span>
                  )}
                </td>
                <td className="text-xs">{formatDate(feed.created_at)}</td>
                <td>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => setHistoryFeed(feed)}
                  >
                    History
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {historyFeed && (
        <HistoryModal feed={historyFeed} onClose={() => setHistoryFeed(null)} />
      )}
    </div>
  );
}

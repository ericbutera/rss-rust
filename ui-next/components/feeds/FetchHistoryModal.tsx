"use client";

import {
  faCircleCheck,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Pagination } from "@ericbutera/kaleido";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  useFetchHistory,
  useTaskStatus,
  type FeedResponse,
  type FetchHistoryPage,
  type FetchHistoryResponse,
} from "../../src/lib/queries";

interface FetchHistoryModalProps {
  feed: FeedResponse;
  taskId?: string | null;
  onClose: () => void;
  onVerified?: () => void;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function VerificationStatus({
  feed,
  taskId,
  onVerified,
}: {
  feed: FeedResponse;
  taskId?: string | null;
  onVerified?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: rawData } = useTaskStatus(taskId ?? null);
  const taskStatus = rawData as { status?: string; error?: string } | undefined;

  useEffect(() => {
    if (taskStatus?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
      onVerified?.();
    }
  }, [taskStatus?.status, onVerified, queryClient]);

  if (feed.verified_at) {
    return (
      <div className="alert alert-success py-2 text-sm mb-4">
        <FontAwesomeIcon icon={faCircleCheck} />
        <span>
          Feed verified{" "}
          <span className="opacity-70">{formatDate(feed.verified_at)}</span>
        </span>
      </div>
    );
  }

  if (taskStatus?.status === "completed") {
    return (
      <div className="alert alert-success py-2 text-sm mb-4">
        <FontAwesomeIcon icon={faCircleCheck} />
        <span>Feed verified successfully</span>
      </div>
    );
  }

  if (taskStatus?.status === "failed") {
    return (
      <div className="alert alert-warning py-2 text-sm mb-4">
        <FontAwesomeIcon icon={faTriangleExclamation} />
        <div>
          <p className="font-semibold">Verification failed</p>
          {taskStatus.error && (
            <p className="text-xs opacity-80 mt-0.5 break-all">
              {taskStatus.error}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (taskId) {
    // pending or processing — show spinner only when there's an active task
    return (
      <div className="alert py-2 text-sm mb-4">
        <span className="loading loading-spinner loading-xs" />
        <span>Verifying feed…</span>
      </div>
    );
  }

  // No task and not verified — likely an older feed or verification wasn't queued
  return (
    <div className="alert alert-warning py-2 text-sm mb-4">
      <FontAwesomeIcon icon={faTriangleExclamation} />
      <span>Feed has not been verified yet</span>
    </div>
  );
}

export default function FetchHistoryModal({
  feed,
  taskId,
  onClose,
  onVerified,
}: FetchHistoryModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);
  const { data: rawData, isLoading } = useFetchHistory(feed.id, page);
  const historyPage = rawData as FetchHistoryPage | undefined;
  const history = historyPage?.data ?? [];
  const metadata = historyPage?.metadata;
  const total = metadata?.total ?? 0;
  const perPage = metadata?.per_page ?? 20;
  const totalPages = metadata?.total_pages ?? 1;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const feedName =
    feed.name ??
    (() => {
      try {
        return new URL(feed.url).hostname;
      } catch {
        return feed.url;
      }
    })();

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box w-11/12 max-w-4xl">
        <h3 className="font-bold text-lg mb-4">
          Fetch History —{" "}
          <span className="font-normal opacity-70">{feedName}</span>
        </h3>

        {!feed.verified_at && (
          <VerificationStatus
            feed={feed}
            taskId={taskId}
            onVerified={onVerified}
          />
        )}

        {isLoading && (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md" />
          </div>
        )}

        {!isLoading && (!history || history.length === 0) && (
          <p className="text-center opacity-50 py-8">No fetch history yet.</p>
        )}

        {!isLoading && history && history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table table-sm table-zebra">
              <thead>
                <tr>
                  <th>Fetched</th>
                  <th>Status</th>
                  <th>Articles</th>
                  <th>Size</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row: FetchHistoryResponse) => (
                  <tr key={row.id}>
                    <td className="text-xs opacity-70 whitespace-nowrap">
                      {formatDate(row.fetched_at)}
                    </td>
                    <td>{statusBadge(row.status_code)}</td>
                    <td>
                      {row.article_count != null ? (
                        <span
                          className={
                            row.article_count > 0
                              ? "text-success font-medium"
                              : ""
                          }
                        >
                          {row.article_count}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-xs">
                      {formatBytes(row.content_length)}
                    </td>
                    <td className="text-xs text-error max-w-xs truncate">
                      {row.error_message ?? ""}
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

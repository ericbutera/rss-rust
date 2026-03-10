"use client";

import { useEffect, useRef } from "react";
import {
  useFetchHistory,
  type FetchHistoryResponse,
} from "../../src/lib/queries";

interface FetchHistoryModalProps {
  feedId: number;
  feedName: string;
  onClose: () => void;
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

export default function FetchHistoryModal({
  feedId,
  feedName,
  onClose,
}: FetchHistoryModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { data: history, isLoading } = useFetchHistory(feedId);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box w-11/12 max-w-4xl">
        <h3 className="font-bold text-lg mb-4">
          Fetch History —{" "}
          <span className="font-normal opacity-70">{feedName}</span>
        </h3>

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

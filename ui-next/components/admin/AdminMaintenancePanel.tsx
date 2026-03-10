"use client";

import { useState } from "react";
import { $api } from "../../src/lib/queries";

export default function AdminMaintenancePanel() {
  const [result, setResult] = useState<{
    rows_updated: number;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = $api.useMutation("post", "/admin/tasks/fix-unread-drift");

  async function runFixDrift() {
    setResult(null);
    setError(null);
    try {
      const data = await mutation.mutateAsync({});
      setResult(data as { rows_updated: number; message: string });
    } catch {
      setError("Failed to run fix — check server logs.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="card card-border">
        <div className="card-body">
          <h2 className="card-title">Fix Unread Count Drift</h2>
          <p className="text-sm text-base-content/70">
            Recalculates <code>unread_count</code> for every subscription from
            ground truth. Run this when unread counts appear incorrect — e.g.
            showing 0 unread when articles are visibly unread.
          </p>
          <p className="text-xs text-base-content/50">
            Root cause: viewing an article that was covered by a bulk &quot;mark
            all as read&quot; can spuriously decrement the counter, eventually
            zeroing out counts for genuinely new articles.
          </p>

          {result && (
            <div role="alert" className="alert alert-success alert-soft">
              <span>
                {result.message} ({result.rows_updated} subscription
                {result.rows_updated !== 1 ? "s" : ""} updated)
              </span>
            </div>
          )}

          {error && (
            <div role="alert" className="alert alert-error alert-soft">
              <span>{error}</span>
            </div>
          )}

          <div className="card-actions">
            <button
              className="btn btn-warning"
              onClick={runFixDrift}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Running…
                </>
              ) : (
                "Run Now"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

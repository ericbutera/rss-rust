"use client";

import { useFetchMissingFavicons, useFixUnreadDrift } from "@/lib/queries";
import { useState } from "react";

function TaskCard({
  title,
  description,
  detail,
  buttonLabel,
  buttonClass,
  onRun,
  isPending,
  result,
  error,
}: {
  title: string;
  description: string;
  detail?: string;
  buttonLabel: string;
  buttonClass?: string;
  onRun: () => void;
  isPending: boolean;
  result: string | null;
  error: string | null;
}) {
  return (
    <div className="card card-border">
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <p className="text-sm text-base-content/70">{description}</p>
        {detail && <p className="text-xs text-base-content/50">{detail}</p>}

        {result && (
          <div role="alert" className="alert alert-success alert-soft">
            <span>{result}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="alert alert-error alert-soft">
            <span>{error}</span>
          </div>
        )}

        <div className="card-actions">
          <button
            className={`btn ${buttonClass ?? "btn-warning"}`}
            onClick={onRun}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Running…
              </>
            ) : (
              buttonLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminMaintenancePanel() {
  const [driftResult, setDriftResult] = useState<string | null>(null);
  const [driftError, setDriftError] = useState<string | null>(null);
  const driftMutation = useFixUnreadDrift();

  const [faviconResult, setFaviconResult] = useState<string | null>(null);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const faviconMutation = useFetchMissingFavicons();

  async function runFixDrift() {
    setDriftResult(null);
    setDriftError(null);
    try {
      const data = await driftMutation.mutateAsync({});
      const d = data as { rows_updated: number; message: string };
      setDriftResult(
        `${d.message} (${d.rows_updated} subscription${d.rows_updated !== 1 ? "s" : ""} updated)`,
      );
    } catch {
      setDriftError("Failed to run fix — check server logs.");
    }
  }

  async function runFetchFavicons() {
    setFaviconResult(null);
    setFaviconError(null);
    try {
      const data = await faviconMutation.mutateAsync({});
      const d = data as { message: string; task_id: string };
      setFaviconResult(`${d.message} (task ${d.task_id})`);
    } catch {
      setFaviconError("Failed to enqueue favicon task — check server logs.");
    }
  }

  return (
    <div className="space-y-6">
      <TaskCard
        title="Fix Unread Count Drift"
        description={`Recalculates unread_count for every subscription from ground truth. Run this when unread counts appear incorrect — e.g. showing 0 unread when articles are visibly unread.`}
        detail={`Root cause: viewing an article that was covered by a bulk "mark all as read" can spuriously decrement the counter, eventually zeroing out counts for genuinely new articles.`}
        buttonLabel="Run Now"
        buttonClass="btn-warning"
        onRun={runFixDrift}
        isPending={driftMutation.isPending}
        result={driftResult}
        error={driftError}
      />

      <TaskCard
        title="Fetch Missing Favicons"
        description="Enqueues a background task that fetches /favicon.ico for every feed that has never had a favicon attempt. The worker processes one feed at a time and marks each as attempted before fetching, preventing duplicate requests."
        detail="Favicons are stored on the shared assets volume and served at /api/favicons/:filename. Re-running this task is safe — feeds already attempted will be skipped."
        buttonLabel="Enqueue Task"
        buttonClass="btn-info"
        onRun={runFetchFavicons}
        isPending={faviconMutation.isPending}
        result={faviconResult}
        error={faviconError}
      />
    </div>
  );
}

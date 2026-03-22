"use client";

import { useCreateFeed } from "@/lib/queries";
import { useState } from "react";

interface AddFeedFormProps {
  onClose: () => void;
  onVerificationAdded: (feedId: number, taskId: string) => void;
}

export default function AddFeedForm({
  onClose,
  onVerificationAdded,
}: AddFeedFormProps) {
  const { mutateAsync: createFeed, isPending } = useCreateFeed();

  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await createFeed({
        url: newUrl,
        name: newName || undefined,
      });
      if (result.task_id) {
        onVerificationAdded(result.feed.id, result.task_id);
      }
      setNewUrl("");
      setNewName("");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add feed";
      setError(msg);
    }
  }

  return (
    <form onSubmit={handleAddFeed} className="px-2 pb-3 flex flex-col gap-1">
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
      <div className="flex gap-1 justify-end">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={isPending}
        >
          {isPending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            onClose();
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useCreateFolder } from "@/lib/queries";
import { useState } from "react";

interface CreateFolderFormProps {
  onClose: () => void;
}

export default function CreateFolderForm({ onClose }: CreateFolderFormProps) {
  const { mutateAsync: createFolder, isPending } = useCreateFolder();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createFolder(name.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-2 pb-3 flex flex-col gap-1">
      <input
        className="input input-bordered input-sm w-full"
        type="text"
        placeholder="Folder name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
      />
      {error && <p className="text-error text-xs">{error}</p>}
      <div className="flex gap-1 justify-end">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={isPending || !name.trim()}
        >
          {isPending ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

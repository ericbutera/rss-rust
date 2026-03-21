"use client";

import FolderViewer from "@/components/feeds/FolderViewer";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useFolders } from "@/lib/queries";
import { useParams, useRouter } from "next/navigation";

export default function FolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const router = useRouter();
  const { data: folders, isLoading } = useFolders();

  const parsedId = parseInt(folderId, 10);
  const folder = isNaN(parsedId)
    ? null
    : (folders.find((f) => f.id === parsedId) ?? null);

  if (isLoading && !folder) {
    return <LoadingSpinner />;
  }

  if (!folder) {
    return (
      <div role="alert" className="alert alert-error mt-4">
        <span>Folder not found.</span>
      </div>
    );
  }

  return (
    <FolderViewer
      folder={folder}
      openArticleId={null}
      onToggleArticle={(articleId) => {
        if (articleId !== null)
          router.push(`/feeds/folder/${folderId}/${articleId}`, {
            scroll: false,
          });
      }}
    />
  );
}

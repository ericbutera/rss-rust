"use client";

import FolderViewer from "@/components/feeds/FolderViewer";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useFolders } from "@/lib/queries";
import { useParams, useRouter } from "next/navigation";

export default function FolderArticlePage() {
  const { folderId, articleId } = useParams<{
    folderId: string;
    articleId: string;
  }>();
  const router = useRouter();
  const { data: folders, isLoading } = useFolders();

  const parsedFolderId = parseInt(folderId, 10);
  const parsedArticleId = parseInt(articleId, 10);
  const folder = isNaN(parsedFolderId)
    ? null
    : (folders.find((f) => f.id === parsedFolderId) ?? null);

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
      openArticleId={isNaN(parsedArticleId) ? null : parsedArticleId}
      onToggleArticle={(newId) => {
        if (newId !== null) {
          router.replace(`/feeds/folder/${folderId}/${newId}`, {
            scroll: false,
          });
        } else {
          router.push(`/feeds/folder/${folderId}`, { scroll: false });
        }
      }}
    />
  );
}

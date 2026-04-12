"use client";

import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  useFeeds,
  useFolderArticles,
  useMarkArticleRead,
  useMarkFolderRead,
  useUpdateFolderView,
  type ArticleResponse,
  type FolderResponse,
} from "@/lib/queries";
import { useArticleViewer } from "@/lib/useArticleViewer";
import { useState } from "react";
import ArticleList from "./ArticleList";
import FolderViewHeader from "./FolderViewHeader";

interface FolderViewerProps {
  folder: FolderResponse;
  openArticleId: number | null;
  onToggleArticle: (id: number | null) => void;
}

export default function FolderViewer({
  folder,
  openArticleId,
  onToggleArticle,
}: FolderViewerProps) {
  const [onlySaved, setOnlySaved] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(folder.only_unread ?? false);

  const { mutateAsync: updateFolderView } = useUpdateFolderView();
  const { mutate: markArticleRead } = useMarkArticleRead();
  const { mutate: markFolderRead } = useMarkFolderRead();
  const { data: feeds } = useFeeds();

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFolderArticles(folder.id, onlySaved, onlyUnread);

  const {
    prefs,
    setDensity,
    setTextSize,
    sentinelRef,
    articles,
    fullOpenArticle,
    toggleArticle,
  } = useArticleViewer({
    openArticleId,
    onToggleArticle,
    articlePages: data?.pages,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    onMarkRead: (article) =>
      markArticleRead(
        { params: { path: { id: article.id } } },
        article.feed_id,
      ),
  });

  async function handleToggleUnread() {
    const next = !onlyUnread;
    setOnlyUnread(next);
    await updateFolderView(folder.id, folder.view_mode, next);
  }

  function handleMarkAllRead() {
    const folderFeedIds = feeds
      .filter((f) => f.folder_id === folder.id)
      .map((f) => f.id);
    markFolderRead(folderFeedIds);
  }

  const emptyMessage = onlySaved
    ? "No saved articles in this folder."
    : onlyUnread
      ? "No unread articles in this folder."
      : "No articles in this folder yet.";

  return (
    <div className="flex flex-col min-h-full">
      <FolderViewHeader
        folder={folder}
        onMarkAllRead={handleMarkAllRead}
        onlySaved={onlySaved}
        onToggleSaved={() => setOnlySaved((v) => !v)}
        onlyUnread={onlyUnread}
        onToggleUnread={handleToggleUnread}
        viewMode={folder.view_mode}
        onViewModeChange={(mode) => updateFolderView(folder.id, mode)}
        density={prefs.density}
        onDensityChange={setDensity}
        textSize={prefs.textSize}
        onTextSizeChange={setTextSize}
      />

      <div className="flex flex-col flex-1">
        {isLoading && <LoadingSpinner />}
        {isError && (
          <div className="alert alert-error">
            <span>Failed to load articles.</span>
          </div>
        )}
        {!isLoading && !isError && articles.length === 0 && (
          <div className="text-center opacity-50 py-16">{emptyMessage}</div>
        )}

        <ArticleList
          articles={articles}
          feeds={feeds}
          openArticleId={openArticleId}
          toggleArticle={toggleArticle}
          viewMode={folder.view_mode}
          density={prefs.density}
          textSize={prefs.textSize}
          fullOpenArticle={fullOpenArticle}
        />

        <div ref={sentinelRef} className="py-2 text-center">
          {isFetchingNextPage && (
            <span className="loading loading-spinner loading-sm" />
          )}
          {!hasNextPage && articles.length > 0 && (
            <span className="text-xs opacity-30">All articles loaded</span>
          )}
        </div>
      </div>
    </div>
  );
}

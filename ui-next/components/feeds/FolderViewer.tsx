"use client";

import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  useFeeds,
  useFolderArticles,
  useMarkArticleRead,
  useMarkFolderRead,
  type ArticleResponse,
  type FolderResponse,
} from "@/lib/queries";
import { useViewPreferences } from "@/lib/useViewPreferences";
import { useEffect, useRef, useState } from "react";
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
  const [viewMode, setViewMode] = useState("list");
  const { prefs, setDensity, setTextSize } = useViewPreferences();
  const { data: feeds } = useFeeds();

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFolderArticles(folder.id, onlySaved);

  const { mutate: markArticleRead } = useMarkArticleRead();
  const { mutate: markFolderRead } = useMarkFolderRead();

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function toggleArticle(article: ArticleResponse) {
    if (openArticleId !== article.id) {
      onToggleArticle(article.id);
      if (!article.read_at) {
        markArticleRead(
          { params: { path: { id: article.id } } },
          article.feed_id,
        );
      }
    } else {
      onToggleArticle(null);
    }
  }

  function handleMarkAllRead() {
    const folderFeedIds = feeds
      .filter((f) => f.folder_id === folder.id)
      .map((f) => f.id);
    markFolderRead(folderFeedIds);
  }

  const articles = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex flex-col min-h-full">
      <FolderViewHeader
        folder={folder}
        onMarkAllRead={handleMarkAllRead}
        onlySaved={onlySaved}
        onToggleSaved={() => setOnlySaved((v) => !v)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
          <div className="text-center opacity-50 py-16">
            {onlySaved
              ? "No saved articles in this folder."
              : "No articles in this folder yet."}
          </div>
        )}

        {!isLoading && !isError && articles.length > 0 && (
          <ArticleList
            articles={articles}
            openArticleId={openArticleId}
            toggleArticle={toggleArticle}
            viewMode={viewMode}
            density={prefs.density}
            textSize={prefs.textSize}
          />
        )}

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

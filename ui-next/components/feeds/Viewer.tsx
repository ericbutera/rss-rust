"use client";

import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  useArticle,
  useFeedArticles,
  useMarkArticleRead,
  useMarkFeedRead,
  useToggleSaveArticle,
  useUnsubscribeFeed,
  useUpdateFeedView,
  type ArticleResponse,
  type FeedResponse,
} from "@/lib/queries";
import { useArticleKeyboardNav } from "@/lib/useArticleKeyboardNav";
import { useViewPreferences } from "@/lib/useViewPreferences";
import { useEffect, useRef, useState } from "react";
import ArticleList from "./ArticleList";
import FetchHistoryModal from "./FetchHistoryModal";
import ViewHeader from "./ViewHeader";

function feedLabel(feed: FeedResponse): string {
  if (feed.name) return feed.name;
  try {
    return new URL(feed.url).hostname;
  } catch {
    return feed.url || "Unknown feed";
  }
}

interface ViewerProps {
  feed: FeedResponse;
  openArticleId: number | null;
  onToggleArticle: (id: number | null) => void;
  onUnsubscribed: () => void;
}

export default function Viewer({
  feed,
  openArticleId,
  onToggleArticle,
  onUnsubscribed,
}: ViewerProps) {
  const [onlySaved, setOnlySaved] = useState(false);
  const { prefs, setDensity, setTextSize } = useViewPreferences();
  const { mutateAsync: updateFeedView } = useUpdateFeedView();

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeedArticles(feed.id, onlySaved);

  const { mutate: markArticleRead } = useMarkArticleRead();
  const { mutate: markFeedRead } = useMarkFeedRead();
  const { mutateAsync: unsubscribeFeed } = useUnsubscribeFeed();
  const [showHistory, setShowHistory] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll: watch sentinel div at the bottom
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
        markArticleRead({ params: { path: { id: article.id } } }, feed.id);
      }
    } else {
      onToggleArticle(null);
    }
  }

  function handleMarkAllRead() {
    markFeedRead({ params: { path: { id: feed.id } } });
  }

  async function handleUnsubscribe() {
    const name = feedLabel(feed);
    if (!confirm(`Unsubscribe from "${name}"?`)) return;
    await unsubscribeFeed(feed.id);
    onUnsubscribed();
  }

  const { mutate: toggleSave } = useToggleSaveArticle();

  const pagedArticles = data?.pages.flatMap((p) => p.data) ?? [];

  // Deep-link: if the article isn't in the paged list, fetch it directly.
  const articleInList =
    openArticleId !== null && pagedArticles.some((a) => a.id === openArticleId);

  const { data: deepLinkedArticle } = useArticle(
    openArticleId !== null && !articleInList && !isLoading
      ? openArticleId
      : null,
  );

  const articles = deepLinkedArticle
    ? [
        deepLinkedArticle as ArticleResponse,
        ...pagedArticles.filter((a) => a.id !== openArticleId),
      ]
    : pagedArticles;

  useArticleKeyboardNav({
    articles,
    openArticleId,
    onToggleArticle,
    onToggleSave: toggleSave,
    feedId: feed.id,
  });

  return (
    <div className="flex flex-col min-h-full">
      <ViewHeader
        feed={feed}
        onShowHistory={() => setShowHistory(true)}
        onMarkAllRead={handleMarkAllRead}
        onUnsubscribe={handleUnsubscribe}
        onlySaved={onlySaved}
        onToggleSaved={() => setOnlySaved((v) => !v)}
        viewMode={feed.view_mode}
        onViewModeChange={(mode) => updateFeedView(feed.id, mode)}
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
            {onlySaved ? "No saved articles in this feed." : "No articles yet."}
          </div>
        )}

        <ArticleList
          articles={articles}
          feedId={feed.id}
          openArticleId={openArticleId}
          toggleArticle={toggleArticle}
          lastReadAt={feed.last_read_at}
          viewMode={feed.view_mode}
          density={prefs.density}
          textSize={prefs.textSize}
        />

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="py-2 text-center">
          {isFetchingNextPage && (
            <span className="loading loading-spinner loading-sm" />
          )}
          {!hasNextPage && articles.length > 0 && (
            <span className="text-xs opacity-30">All articles loaded</span>
          )}
        </div>
      </div>

      {showHistory && (
        <FetchHistoryModal feed={feed} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

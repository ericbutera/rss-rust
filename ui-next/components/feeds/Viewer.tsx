"use client";

import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  useFeedArticles,
  useMarkArticleRead,
  useMarkFeedRead,
  useUnsubscribeFeed,
  useUpdateFeedView,
  type ArticleResponse,
  type FeedResponse,
} from "@/lib/queries";
import { useArticleViewer } from "@/lib/useArticleViewer";
import { useState } from "react";
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
  const [onlyUnread, setOnlyUnread] = useState(feed.only_unread ?? false);
  const [showHistory, setShowHistory] = useState(false);

  const { mutateAsync: updateFeedView } = useUpdateFeedView();
  const { mutate: markArticleRead } = useMarkArticleRead();
  const { mutate: markFeedRead } = useMarkFeedRead();
  const { mutateAsync: unsubscribeFeed } = useUnsubscribeFeed();

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeedArticles(feed.id, onlySaved, onlyUnread);

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
      markArticleRead({ params: { path: { id: article.id } } }, feed.id),
    keyboardNavFeedId: feed.id,
  });

  async function handleToggleUnread() {
    const next = !onlyUnread;
    setOnlyUnread(next);
    await updateFeedView(feed.id, feed.view_mode, next);
  }

  async function handleUnsubscribe() {
    if (!confirm(`Unsubscribe from "${feedLabel(feed)}"?`)) return;
    await unsubscribeFeed(feed.id);
    onUnsubscribed();
  }

  const emptyMessage = onlySaved
    ? "No saved articles in this feed."
    : onlyUnread
      ? "No unread articles in this feed."
      : "No articles yet.";

  return (
    <div className="flex flex-col min-h-full">
      <ViewHeader
        feed={feed}
        onShowHistory={() => setShowHistory(true)}
        onMarkAllRead={() => markFeedRead({ params: { path: { id: feed.id } } })}
        onUnsubscribe={handleUnsubscribe}
        onlySaved={onlySaved}
        onToggleSaved={() => setOnlySaved((v) => !v)}
        onlyUnread={onlyUnread}
        onToggleUnread={handleToggleUnread}
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
          <div className="text-center opacity-50 py-16">{emptyMessage}</div>
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

      {showHistory && (
        <FetchHistoryModal feed={feed} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

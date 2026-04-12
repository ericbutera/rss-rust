import {
  useArticle,
  useToggleSaveArticle,
  type ArticleResponse,
} from "@/lib/queries";
import { useArticleKeyboardNav } from "@/lib/useArticleKeyboardNav";
import { useViewPreferences } from "@/lib/useViewPreferences";
import { useEffect, useRef } from "react";

interface UseArticleViewerOptions {
  openArticleId: number | null;
  onToggleArticle: (id: number | null) => void;
  /** `data?.pages` from useFeedArticles / useFolderArticles. */
  articlePages: { data: ArticleResponse[] }[] | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  /** Called when an unread article is opened and should be marked as read. */
  onMarkRead: (article: ArticleResponse) => void;
  /** Passed to keyboard nav; only needed in single-feed view. */
  keyboardNavFeedId?: number;
}

/**
 * Shared logic for Viewer and FolderViewer:
 *  - Infinite-scroll IntersectionObserver
 *  - Pinned-article ref (keeps opened article in list after onlyUnread refetch)
 *  - Article list merging
 *  - toggleArticle handler
 *  - View preferences
 *  - Keyboard navigation
 */
export function useArticleViewer({
  openArticleId,
  onToggleArticle,
  articlePages,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onMarkRead,
  keyboardNavFeedId,
}: UseArticleViewerOptions) {
  const { prefs, setDensity, setTextSize } = useViewPreferences();
  const { mutate: toggleSave } = useToggleSaveArticle();

  const sentinelRef = useRef<HTMLDivElement>(null);
  const pinnedArticleRef = useRef<ArticleResponse | null>(null);

  // Infinite scroll: fire fetchNextPage when sentinel comes into view.
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

  const pagedArticles = articlePages?.flatMap((p) => p.data) ?? [];
  const { data: fullOpenArticle } = useArticle(openArticleId);

  // Keep opened article visible even after onlyUnread refetch removes it.
  // Fall back to pinned snapshot when fullOpenArticle is still loading.
  const articleInList =
    openArticleId !== null && pagedArticles.some((a) => a.id === openArticleId);
  const effectiveFallback =
    (fullOpenArticle ?? pinnedArticleRef.current) as ArticleResponse | undefined;

  const articles =
    effectiveFallback && !articleInList
      ? [
          effectiveFallback,
          ...pagedArticles.filter((a) => a.id !== openArticleId),
        ]
      : pagedArticles;

  function toggleArticle(article: ArticleResponse) {
    if (openArticleId !== article.id) {
      pinnedArticleRef.current = article;
      onToggleArticle(article.id);
      if (!article.read_at) onMarkRead(article);
    } else {
      pinnedArticleRef.current = null;
      onToggleArticle(null);
    }
  }

  useArticleKeyboardNav({
    articles,
    openArticleId,
    onToggleArticle,
    onToggleSave: toggleSave,
    feedId: keyboardNavFeedId,
  });

  return {
    prefs,
    setDensity,
    setTextSize,
    sentinelRef,
    articles,
    fullOpenArticle: fullOpenArticle as ArticleResponse | undefined,
    toggleArticle,
  };
}

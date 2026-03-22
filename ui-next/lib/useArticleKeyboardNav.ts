import { useEffect } from "react";
import type { ArticleResponse } from "./queries";

interface ArticleKeyboardNavOptions {
  articles: ArticleResponse[];
  openArticleId: number | null;
  onToggleArticle: (id: number | null) => void;
  onToggleSave: (articleId: number, feedId: number) => void;
  /** Feed-level feedId; falls back to article.feed_id in folder views. */
  feedId?: number;
}

/**
 * Attaches keyboard shortcuts for navigating an article list:
 *   j — next article
 *   k — previous article
 *   o — open selected article's URL in a new tab
 *   b — toggle bookmark (save/unsave) on the open article
 */
export function useArticleKeyboardNav({
  articles,
  openArticleId,
  onToggleArticle,
  onToggleSave,
  feedId,
}: ArticleKeyboardNavOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs / textareas / contentEditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const currentIndex =
        openArticleId !== null
          ? articles.findIndex((a) => a.id === openArticleId)
          : -1;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          const nextIdx =
            currentIndex < articles.length - 1 ? currentIndex + 1 : 0;
          const next = articles[nextIdx];
          if (next) onToggleArticle(next.id);
          break;
        }
        case "k": {
          e.preventDefault();
          const prevIdx =
            currentIndex > 0 ? currentIndex - 1 : articles.length - 1;
          const prev = articles[prevIdx];
          if (prev) onToggleArticle(prev.id);
          break;
        }
        case "o": {
          // Open original URL in new tab
          if (openArticleId !== null) {
            const article = articles.find((a) => a.id === openArticleId);
            if (article) {
              window.open(article.url, "_blank", "noopener,noreferrer");
            }
          }
          break;
        }
        case "b": {
          // Toggle bookmark on the open article
          if (openArticleId !== null) {
            const article = articles.find((a) => a.id === openArticleId);
            if (article) {
              onToggleSave(article.id, feedId ?? article.feed_id);
            }
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [articles, openArticleId, onToggleArticle, onToggleSave, feedId]);
}

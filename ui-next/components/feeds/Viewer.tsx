"use client";

import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";
import {
  useFeedArticles,
  useMarkArticleRead,
  useMarkFeedRead,
  type ArticleResponse,
} from "../../src/lib/queries";

/** Sanitize HTML on the client only (DOMPurify needs a real DOM). */
function useSafeHtml(html: string | null | undefined): string {
  const [safe, setSafe] = useState("");
  useEffect(() => {
    if (!html) {
      setSafe("");
      return;
    }
    setSafe(
      DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        // Strip javascript: hrefs, data: URIs on imgs, etc.
        FORBID_ATTR: ["onerror", "onload", "onclick", "style"],
      }),
    );
  }, [html]);
  return safe;
}

// TODO: can https://date-fns.org/ do this? this is messy
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

interface ViewerProps {
  feedId: number;
}

export default function Viewer({ feedId }: ViewerProps) {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeedArticles(feedId);

  const { mutate: markArticleRead } = useMarkArticleRead();
  const { mutate: markFeedRead } = useMarkFeedRead();
  const [openArticleId, setOpenArticleId] = useState<number | null>(null);

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

  // Reset open article when feed changes
  useEffect(() => {
    setOpenArticleId(null);
  }, [feedId]);

  function toggleArticle(article: ArticleResponse) {
    if (openArticleId !== article.id) {
      setOpenArticleId(article.id);
      if (!article.read_at) {
        markArticleRead({ params: { path: { id: article.id } } }, feedId);
      }
    } else {
      setOpenArticleId(null);
    }
  }

  function handleMarkAllRead() {
    markFeedRead({ params: { path: { id: feedId } } });
  }

  const articles = data?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = data?.pages[0]?.total ?? 0;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="alert alert-error">
        <span>Failed to load articles.</span>
      </div>
    );
  }

  if (articles.length === 0) {
    return <div className="text-center opacity-50 py-16">No articles yet.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">
          Articles
          {totalCount > 0 && (
            <span className="ml-2 text-sm font-normal opacity-50">
              ({totalCount})
            </span>
          )}
        </h2>
        <button className="btn btn-ghost btn-sm" onClick={handleMarkAllRead}>
          Mark all read
        </button>
      </div>

      {articles.map((article: ArticleResponse) => {
        const isRead = Boolean(article.read_at);
        const isOpen = openArticleId === article.id;

        return (
          <div
            key={article.id}
            className={`collapse collapse-arrow border border-base-300 ${
              isRead ? "bg-base-200 opacity-60" : "bg-base-100"
            }`}
          >
            <input
              type="checkbox"
              checked={isOpen}
              onChange={() => toggleArticle(article)}
            />
            <div
              className={`collapse-title font-medium ${
                isRead ? "text-base-content/50" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                {!isRead && (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
                <span className="truncate flex-1">
                  {article.title ?? article.url}
                </span>
                <span className="text-xs opacity-40 shrink-0 font-normal">
                  {relativeTime(article.created_at)}
                </span>
              </span>
            </div>
            <div className="collapse-content text-sm">
              <ArticleBody article={article} />
            </div>
          </div>
        );
      })}

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
  );
}

function ArticleBody({ article }: { article: ArticleResponse }) {
  const safeContent = useSafeHtml(article.content);
  const safeDescription = useSafeHtml(article.description);

  return (
    <div className="flex flex-col gap-3 pt-1">
      {safeDescription && !article.content && (
        <div
          className="prose prose-sm max-w-none opacity-80"
          dangerouslySetInnerHTML={{ __html: safeDescription }}
        />
      )}

      {article.content && (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: safeContent }}
        />
      )}

      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="link link-primary text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        Open original ↗
      </a>
    </div>
  );
}

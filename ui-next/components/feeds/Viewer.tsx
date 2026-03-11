"use client";

import {
  useFeedArticles,
  useMarkArticleRead,
  useMarkFeedRead,
  useUnsubscribeFeed,
  type ArticleResponse,
  type FeedResponse,
} from "@/lib/queries";
import {
  faCircleCheck,
  faClockRotateLeft,
  faRss,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";
import FetchHistoryModal from "./FetchHistoryModal";

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
  onUnsubscribed: () => void;
}

export default function Viewer({ feed, onUnsubscribed }: ViewerProps) {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeedArticles(feed.id);

  const { mutate: markArticleRead } = useMarkArticleRead();
  const { mutate: markFeedRead } = useMarkFeedRead();
  const { mutateAsync: unsubscribeFeed } = useUnsubscribeFeed();
  const [openArticleId, setOpenArticleId] = useState<number | null>(null);
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

  // Reset open article when feed changes
  useEffect(() => {
    setOpenArticleId(null);
  }, [feed.id]);

  function toggleArticle(article: ArticleResponse) {
    if (openArticleId !== article.id) {
      setOpenArticleId(article.id);
      if (!article.read_at) {
        markArticleRead({ params: { path: { id: article.id } } }, feed.id);
      }
    } else {
      setOpenArticleId(null);
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

  const articles = data?.pages.flatMap((p) => p.data) ?? [];
  const totalCount = data?.pages[0]?.metadata.total ?? 0;

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky action bar — always visible */}
      <div className="sticky top-0 z-20 bg-base-100 border-b border-base-300 px-4 py-2 flex items-center gap-3 min-w-0">
        <FontAwesomeIcon icon={faRss} className="opacity-50 shrink-0" />
        <span className="font-semibold truncate flex-1 min-w-0">
          {feedLabel(feed)}
        </span>
        {feed.unread_count > 0 && (
          <span className="badge badge-primary badge-sm shrink-0">
            {feed.unread_count}
          </span>
        )}
        <ul className="menu menu-horizontal bg-base-200 rounded-box p-1 shrink-0">
          <li>
            <a
              className="tooltip tooltip-bottom"
              data-tip="Fetch history"
              onClick={() => setShowHistory(true)}
            >
              <FontAwesomeIcon icon={faClockRotateLeft} />
            </a>
          </li>
          <li>
            <a
              className="tooltip tooltip-bottom"
              data-tip="Mark all read"
              onClick={handleMarkAllRead}
            >
              <FontAwesomeIcon icon={faCircleCheck} />
            </a>
          </li>
          <li>
            <a
              className="tooltip tooltip-bottom text-error"
              data-tip="Unsubscribe"
              onClick={handleUnsubscribe}
            >
              <FontAwesomeIcon icon={faTrash} />
            </a>
          </li>
        </ul>
      </div>

      {/* Article content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {isLoading && (
          <div className="flex justify-center py-16">
            <span className="loading loading-spinner loading-lg" />
          </div>
        )}
        {isError && (
          <div className="alert alert-error">
            <span>Failed to load articles.</span>
          </div>
        )}
        {!isLoading && !isError && articles.length === 0 && (
          <div className="text-center opacity-50 py-16">No articles yet.</div>
        )}

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
      {/* end article content */}

      {showHistory && (
        <FetchHistoryModal feed={feed} onClose={() => setShowHistory(false)} />
      )}
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

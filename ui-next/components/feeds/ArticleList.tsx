"use client";

import { API_URL } from "@/lib/config";
import {
  useToggleSaveArticle,
  type ArticleResponse,
  type FeedResponse,
} from "@/lib/queries";
import type { Density, TextSize } from "@/lib/useViewPreferences";
import { faBookmark as faBookmarkOutline } from "@fortawesome/free-regular-svg-icons";
import { faBookmark, faRss } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DOMPurify from "dompurify";
import { useEffect, useState } from "react";

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
        FORBID_ATTR: ["onerror", "onload", "onclick", "style"],
      }),
    );
  }, [html]);
  return safe;
}

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

function articleDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 8);
  }
}

function domainHue(domain: string): number {
  let h = 0;
  for (let i = 0; i < domain.length; i++) {
    h = domain.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h) % 360;
}

/**
 * Shows article.image_url when available (with broken-image fallback),
 * otherwise renders a pastel initial-letter avatar derived from the article's
 * domain — giving each site a consistent, recognisable colour.
 */
function ArticleThumbnail({
  article,
  className,
}: {
  article: ArticleResponse;
  className: string;
}) {
  const [imgError, setImgError] = useState(false);
  const domain = articleDomain(article.url);
  const hue = domainHue(domain);
  const fallbackStyle = {
    backgroundColor: `hsl(${hue} 35% 80%)`,
    color: `hsl(${hue} 35% 25%)`,
  };

  if (article.image_url && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={article.image_url}
        alt=""
        className={className}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center font-bold text-xl select-none`}
      style={fallbackStyle}
    >
      {domain[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

/** Intercept all link clicks inside an article body and open them in a new tab. */
function handleArticleBodyClick(e: React.MouseEvent<HTMLDivElement>) {
  const anchor = (e.target as HTMLElement).closest("a");
  if (!anchor || !anchor.href) return;
  e.preventDefault();
  window.open(anchor.href, "_blank", "noopener,noreferrer");
}

function ArticleBody({ article }: { article: ArticleResponse }) {
  const safeContent = useSafeHtml(article.content);
  const safeDescription = useSafeHtml(article.description);

  return (
    <div className="flex flex-col gap-3 pt-1">
      {safeDescription && !article.content && (
        <div
          className="article-body max-w-none"
          onClick={handleArticleBodyClick}
          dangerouslySetInnerHTML={{ __html: safeDescription }}
        />
      )}

      {article.content && (
        <div
          className="article-body max-w-none"
          onClick={handleArticleBodyClick}
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

/** Shows feed source label in folder views where articles come from multiple feeds. */
function FeedLabel({ feed }: { feed: FeedResponse | undefined }) {
  const [imgError, setImgError] = useState(false);
  if (!feed) return null;
  const name =
    feed.name ??
    (() => {
      try {
        return new URL(feed.url).hostname;
      } catch {
        return feed.url;
      }
    })();
  return (
    <span className="flex items-center gap-1 text-xs opacity-40 shrink-0 max-w-[100px]">
      {feed.favicon_url && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${API_URL}/favicons/${feed.favicon_url}`}
          alt=""
          width={12}
          height={12}
          className="w-3 h-3 shrink-0"
          onError={() => setImgError(true)}
        />
      ) : (
        <FontAwesomeIcon icon={faRss} className="shrink-0" />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

/** In single-feed view: shows the article author if available. */
function ArticleAuthor({ author }: { author?: string | null }) {
  if (!author) return null;
  return (
    <span className="text-xs opacity-40 shrink-0 truncate max-w-[120px]">
      {author}
    </span>
  );
}

interface ArticleListProps {
  articles: ArticleResponse[];
  feedId?: number;
  /** Passed from folder views so each article can show its source feed. */
  feeds?: FeedResponse[];
  openArticleId: number | null;
  toggleArticle: (article: ArticleResponse) => void;
  lastReadAt?: string | null;
  viewMode?: string;
  density?: Density;
  textSize?: TextSize;
  /** Full article data for the open article — fetched separately for body content. */
  fullOpenArticle?: ArticleResponse;
}

export default function ArticleList({
  articles,
  feedId,
  feeds,
  openArticleId,
  toggleArticle,
  lastReadAt,
  viewMode = "list",
  density = "default",
  textSize = "base",
  fullOpenArticle,
}: ArticleListProps) {
  const { mutate: toggleSave } = useToggleSaveArticle();
  const feedMap = feeds
    ? Object.fromEntries(feeds.map((f) => [f.id, f]))
    : null;
  const articleRead = (article: ArticleResponse) =>
    Boolean(article.read_at) ||
    (!!lastReadAt && article.created_at <= lastReadAt);

  if (viewMode === "cards") {
    return (
      <div
        className="article-list article-card-grid p-4"
        data-density={density}
        data-text-size={textSize}
      >
        {articles.map((article) => {
          const isRead = articleRead(article);
          const isOpen = openArticleId === article.id;
          const articleFeed = feedMap?.[article.feed_id];
          return (
            <div
              key={article.id}
              className={`card bg-base-100 border border-base-300 cursor-pointer hover:border-primary transition-colors ${isRead && !isOpen ? "opacity-60" : ""}`}
              onClick={() => toggleArticle(article)}
            >
              <ArticleThumbnail
                article={article}
                className="rounded-t-box w-full h-36 object-cover"
              />
              <div className="card-body article-card-inner p-3 gap-1">
                <p
                  className={`article-card-title font-semibold text-sm leading-snug ${isOpen ? "" : "line-clamp-2"}`}
                >
                  {article.title ?? article.url}
                </p>
                {article.preview && (
                  <p
                    className={`text-xs text-base-content/60 ${isOpen ? "" : "line-clamp-2"}`}
                  >
                    {article.preview}
                  </p>
                )}
                <div className="flex items-center justify-between mt-1">
                  <span className="flex items-center gap-2">
                    <span className="text-xs opacity-40">
                      {relativeTime(article.created_at)}
                    </span>
                    {feedMap ? (
                      <FeedLabel feed={articleFeed} />
                    ) : (
                      <ArticleAuthor author={article.author} />
                    )}
                  </span>
                  <button
                    className={`btn btn-ghost btn-xs btn-circle ${article.saved_at ? "text-primary" : "opacity-40 hover:opacity-100"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSave(article.id, feedId ?? article.feed_id);
                    }}
                    title={article.saved_at ? "Unsave" : "Save"}
                  >
                    <FontAwesomeIcon
                      icon={article.saved_at ? faBookmark : faBookmarkOutline}
                    />
                  </button>
                </div>
                {isOpen && (
                  <div className="mt-2 border-t border-base-300 pt-2">
                    <ArticleBody article={fullOpenArticle ?? article} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (viewMode === "magazine") {
    return (
      <div
        className="article-list flex flex-col divide-y divide-base-300"
        data-density={density}
        data-text-size={textSize}
      >
        {articles.map((article) => {
          const isRead = articleRead(article);
          const isOpen = openArticleId === article.id;
          const articleFeed = feedMap?.[article.feed_id];
          return (
            <div key={article.id}>
              <div
                className={`article-magazine-item flex gap-3 items-start p-3 cursor-pointer hover:bg-base-200 transition-colors ${isRead && !isOpen ? "opacity-60" : ""}`}
                onClick={() => toggleArticle(article)}
              >
                <ArticleThumbnail
                  article={article}
                  className="w-24 h-16 object-cover rounded shrink-0"
                />
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <p
                    className={`article-magazine-title font-semibold text-sm leading-snug ${isOpen ? "text-primary" : "line-clamp-2"}`}
                  >
                    {article.title ?? article.url}
                  </p>
                  {article.preview && (
                    <p className="text-xs opacity-60 line-clamp-2">
                      {article.preview}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-auto">
                    <span className="text-xs opacity-40">
                      {relativeTime(article.created_at)}
                    </span>
                    <span className="ml-auto">
                      {feedMap ? (
                        <FeedLabel feed={articleFeed} />
                      ) : (
                        <ArticleAuthor author={article.author} />
                      )}
                    </span>
                    <button
                      className={`btn btn-ghost btn-xs btn-circle ${article.saved_at ? "text-primary" : "opacity-40 hover:opacity-100"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSave(article.id, feedId ?? article.feed_id);
                      }}
                      title={article.saved_at ? "Unsave" : "Save"}
                    >
                      <FontAwesomeIcon
                        icon={article.saved_at ? faBookmark : faBookmarkOutline}
                      />
                    </button>
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className="px-3 pb-4 bg-base-100 text-sm">
                  <ArticleBody article={fullOpenArticle ?? article} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Default: list (accordion)
  return (
    <div
      className="article-list"
      data-density={density}
      data-text-size={textSize}
    >
      {articles.map((article: ArticleResponse) => {
        const isRead = articleRead(article);
        const isOpen = openArticleId === article.id;
        const articleFeed = feedMap?.[article.feed_id];
        return (
          <div
            key={article.id}
            className={`collapse collapse-arrow border border-base-300 ${
              isRead && !isOpen ? "bg-base-200" : "bg-base-100"
            }`}
          >
            <input
              type="checkbox"
              checked={isOpen}
              onChange={() => toggleArticle(article)}
            />
            <div
              className={`collapse-title ${
                isOpen
                  ? "font-semibold text-primary"
                  : isRead
                    ? "text-base-content/40"
                    : "text-base-content"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={isOpen ? "flex-1" : "truncate flex-1"}>
                  {article.title ?? article.url}
                </span>
                {feedMap ? (
                  <FeedLabel feed={articleFeed} />
                ) : (
                  <ArticleAuthor author={article.author} />
                )}
                <div
                  className="tooltip tooltip-left relative z-[2]"
                  data-tip={
                    article.saved_at ? "Unsave article" : "Save article"
                  }
                >
                  <button
                    className={`btn btn-ghost btn-xs btn-circle ${article.saved_at ? "text-primary" : "opacity-40 hover:opacity-100"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSave(article.id, feedId ?? article.feed_id);
                    }}
                  >
                    <FontAwesomeIcon
                      icon={article.saved_at ? faBookmark : faBookmarkOutline}
                    />
                  </button>
                </div>
                <span className="text-xs opacity-40 shrink-0 font-normal">
                  {relativeTime(article.created_at)}
                </span>
              </span>
              {article.preview && (
                <p className="text-xs text-base-content/60 mt-0.5 line-clamp-1">
                  {article.preview}
                </p>
              )}
            </div>
            <div className="collapse-content text-sm bg-base-100 text-base-content">
              <ArticleBody article={fullOpenArticle ?? article} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

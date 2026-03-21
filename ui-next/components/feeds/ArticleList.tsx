"use client";

import { useToggleSaveArticle, type ArticleResponse } from "@/lib/queries";
import type { Density, TextSize } from "@/lib/useViewPreferences";
import { faBookmark as faBookmarkOutline } from "@fortawesome/free-regular-svg-icons";
import { faBookmark } from "@fortawesome/free-solid-svg-icons";
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

interface ArticleListProps {
  articles: ArticleResponse[];
  feedId: number;
  openArticleId: number | null;
  toggleArticle: (article: ArticleResponse) => void;
  lastReadAt?: string | null;
  viewMode?: string;
  density?: Density;
  textSize?: TextSize;
}

export default function ArticleList({
  articles,
  feedId,
  openArticleId,
  toggleArticle,
  lastReadAt,
  viewMode = "list",
  density = "default",
  textSize = "base",
}: ArticleListProps) {
  const { mutate: toggleSave } = useToggleSaveArticle();
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
              <div className="card-body p-3 gap-1">
                <p className="font-semibold text-sm leading-snug line-clamp-2">
                  {article.title ?? article.url}
                </p>
                {article.preview && (
                  <p className="text-xs opacity-60 line-clamp-3">
                    {article.preview}
                  </p>
                )}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs opacity-40">
                    {relativeTime(article.created_at)}
                  </span>
                  <button
                    className={`btn btn-ghost btn-xs btn-circle ${article.saved_at ? "text-primary" : "opacity-40 hover:opacity-100"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSave(article.id, feedId);
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
                    <ArticleBody article={article} />
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
          return (
            <div key={article.id}>
              <div
                className={`flex gap-3 items-start p-3 cursor-pointer hover:bg-base-200 transition-colors ${isRead && !isOpen ? "opacity-60" : ""}`}
                onClick={() => toggleArticle(article)}
              >
                <ArticleThumbnail
                  article={article}
                  className="w-24 h-16 object-cover rounded shrink-0"
                />
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <p
                    className={`font-semibold text-sm leading-snug line-clamp-2 ${isOpen ? "text-primary" : ""}`}
                  >
                    {article.title ?? article.url}
                  </p>
                  {article.preview && (
                    <p className="text-xs opacity-60 line-clamp-2">
                      {article.preview}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-auto">
                    <span className="text-xs opacity-40 flex-1">
                      {relativeTime(article.created_at)}
                    </span>
                    <button
                      className={`btn btn-ghost btn-xs btn-circle ${article.saved_at ? "text-primary" : "opacity-40 hover:opacity-100"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSave(article.id, feedId);
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
                  <ArticleBody article={article} />
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
                <span className="truncate flex-1">
                  {article.title ?? article.url}
                </span>
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
                      toggleSave(article.id, feedId);
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
            </div>
            <div className="collapse-content text-sm bg-base-100 text-base-content">
              <ArticleBody article={article} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

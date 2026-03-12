"use client";

import type { ArticleResponse } from "@/lib/queries";
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

function ArticleBody({ article }: { article: ArticleResponse }) {
  const safeContent = useSafeHtml(article.content);
  const safeDescription = useSafeHtml(article.description);

  return (
    <div className="flex flex-col gap-3 pt-1">
      {safeDescription && !article.content && (
        <div
          className="article-body max-w-none"
          dangerouslySetInnerHTML={{ __html: safeDescription }}
        />
      )}

      {article.content && (
        <div
          className="article-body max-w-none"
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

export default function ArticleList({
  articles,
  openArticleId,
  toggleArticle,
}: {
  articles: ArticleResponse[];
  openArticleId: number | null;
  toggleArticle: (article: ArticleResponse) => void;
}) {
  return (
    <>
      {articles.map((article: ArticleResponse) => {
        const isRead = Boolean(article.read_at);
        const isOpen = openArticleId === article.id;

        return (
          <div
            key={article.id}
            className={`collapse collapse-arrow border border-base-300 ${
              isRead && !isOpen ? "bg-base-200 opacity-60" : "bg-base-100"
            }`}
          >
            <input
              type="checkbox"
              checked={isOpen}
              onChange={() => toggleArticle(article)}
            />
            <div
              className={`collapse-title font-medium ${
                isRead && !isOpen ? "text-base-content/50" : "text-base-content"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="truncate flex-1">
                  {article.title ?? article.url}
                </span>
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
    </>
  );
}

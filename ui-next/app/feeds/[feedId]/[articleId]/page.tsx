"use client";

import Viewer from "@/components/feeds/Viewer";
import { useFeeds } from "@/lib/queries";
import { useParams, useRouter } from "next/navigation";

export default function ArticlePage() {
  const { feedId, articleId } = useParams<{
    feedId: string;
    articleId: string;
  }>();
  const router = useRouter();
  const { data: feeds, isLoading } = useFeeds();

  const parsedFeedId = parseInt(feedId, 10);
  const parsedArticleId = parseInt(articleId, 10);
  const feed = isNaN(parsedFeedId)
    ? null
    : (feeds.find((f) => f.id === parsedFeedId) ?? null);

  if (isLoading && !feed) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!feed) {
    return (
      <div role="alert" className="alert alert-error mt-4">
        <span>Feed not found.</span>
      </div>
    );
  }

  return (
    <Viewer
      feed={feed}
      openArticleId={isNaN(parsedArticleId) ? null : parsedArticleId}
      onToggleArticle={(newId) => {
        if (newId !== null) {
          // replace so switching articles doesn't pile up history
          router.replace(`/feeds/${feedId}/${newId}`);
        } else {
          router.push(`/feeds/${feedId}`);
        }
      }}
      onUnsubscribed={() => router.push("/feeds")}
    />
  );
}

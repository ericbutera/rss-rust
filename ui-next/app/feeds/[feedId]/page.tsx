"use client";

import Viewer from "@/components/feeds/Viewer";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useFeeds } from "@/lib/queries";
import { useParams, useRouter } from "next/navigation";

export default function FeedPage() {
  const { feedId } = useParams<{ feedId: string }>();
  const router = useRouter();
  const { data: feeds, isLoading } = useFeeds();

  const parsedId = parseInt(feedId, 10);
  const feed = isNaN(parsedId)
    ? null
    : (feeds.find((f) => f.id === parsedId) ?? null);

  if (isLoading && !feed) return <LoadingSpinner />;

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
      openArticleId={null}
      onToggleArticle={(articleId) => {
        if (articleId !== null)
          router.push(`/feeds/${feedId}/${articleId}`, { scroll: false });
      }}
      onUnsubscribed={() => router.push("/feeds")}
    />
  );
}

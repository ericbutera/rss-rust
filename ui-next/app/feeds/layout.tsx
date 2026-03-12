"use client";

import Menu from "@/components/feeds/Menu";
import Layout from "@/components/Layout";
import { useFeeds, type FeedResponse } from "@/lib/queries";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";

export default function FeedsLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ feedId?: string }>();
  const router = useRouter();
  const { data: feeds } = useFeeds();

  const feedId = params.feedId ? parseInt(params.feedId, 10) : null;
  const selectedFeed =
    feedId !== null ? (feeds.find((f) => f.id === feedId) ?? null) : null;

  function handleSelectFeed(feed: FeedResponse | null) {
    router.push(feed ? `/feeds/${feed.id}` : "/feeds");
  }

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="bg-base-200 border-r border-base-300 shrink-0 flex flex-col relative">
          <div className="flex-1">
            <Menu selectedFeed={selectedFeed} onSelectFeed={handleSelectFeed} />
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </Layout>
  );
}

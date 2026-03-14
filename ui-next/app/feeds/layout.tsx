"use client";

import Menu from "@/components/feeds/Menu";
import Layout from "@/components/Layout";
import { useFeeds, type FeedResponse } from "@/lib/queries";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
      <div className="drawer lg:drawer-open">
        <input id="feeds-drawer" type="checkbox" className="drawer-toggle" />
        <div className="drawer-content flex flex-col">
          <div className="navbar bg-base-200 lg:hidden">
            <label
              htmlFor="feeds-drawer"
              aria-label="open sidebar"
              className="btn btn-square btn-ghost"
            >
              <FontAwesomeIcon icon={faBars} />
            </label>
            <span className="px-2 font-semibold">Feeds</span>
          </div>
          <main className="flex-1 overflow-y-auto p-4">{children}</main>
        </div>
        <div className="drawer-side">
          <label
            htmlFor="feeds-drawer"
            aria-label="close sidebar"
            className="drawer-overlay"
          />
          <aside className="bg-base-200 min-h-full w-64">
            <Menu selectedFeed={selectedFeed} onSelectFeed={handleSelectFeed} />
          </aside>
        </div>
      </div>
    </Layout>
  );
}

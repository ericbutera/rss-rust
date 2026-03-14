"use client";

import Menu from "@/components/feeds/Menu";
import Layout from "@/components/Layout";
import { useFeeds, type FeedResponse } from "@/lib/queries";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export default function FeedsLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ feedId?: string }>();
  const router = useRouter();
  const { data: feeds } = useFeeds();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const feedId = params.feedId ? parseInt(params.feedId, 10) : null;
  const selectedFeed =
    feedId !== null ? (feeds.find((f) => f.id === feedId) ?? null) : null;

  function handleSelectFeed(feed: FeedResponse | null) {
    setSidebarOpen(false);
    router.push(feed ? `/feeds/${feed.id}` : "/feeds");
  }

  return (
    <Layout>
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-30 w-64 bg-base-200 transition-transform duration-200
            lg:static lg:[translate:none] lg:z-auto
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <Menu selectedFeed={selectedFeed} onSelectFeed={handleSelectFeed} />
        </aside>

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
          <div className="navbar bg-base-200 lg:hidden">
            <button
              type="button"
              aria-label={sidebarOpen ? "close sidebar" : "open sidebar"}
              className="btn btn-square btn-ghost"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <FontAwesomeIcon icon={sidebarOpen ? faXmark : faBars} />
            </button>
            <span className="px-2 font-semibold">Feeds</span>
          </div>
          <main className="flex-1 p-4">{children}</main>
        </div>
      </div>
    </Layout>
  );
}

"use client";

import RequireAuth from "@/components/auth/RequireAuth";
import Menu from "@/components/feeds/Menu";
import Layout from "@/components/Layout";
import {
  MobileLeadingContext,
  SidebarOpenContext,
} from "@/components/Navigation";
import {
  useFeeds,
  useFolders,
  type FeedResponse,
  type FolderResponse,
} from "@/lib/queries";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

function FeedsLayoutInner({ children }: { children: ReactNode }) {
  const params = useParams<{ feedId?: string; folderId?: string }>();
  const router = useRouter();
  const { data: feeds } = useFeeds();
  const { data: folders } = useFolders();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const feedId = params.feedId ? parseInt(params.feedId, 10) : null;
  const folderId = params.folderId ? parseInt(params.folderId, 10) : null;

  const selectedFeed =
    feedId !== null && !isNaN(feedId)
      ? (feeds.find((f) => f.id === feedId) ?? null)
      : null;

  const selectedFolderId =
    folderId !== null && !isNaN(folderId) ? folderId : null;

  // Auto-select first feed when navigating to /feeds with nothing selected
  useEffect(() => {
    if (feedId === null && folderId === null && feeds.length > 0) {
      router.replace(`/feeds/${feeds[0].id}`);
    }
  }, [feedId, folderId, feeds, router]);

  function handleSelectFeed(feed: FeedResponse | null) {
    setSidebarOpen(false);
    router.push(feed ? `/feeds/${feed.id}` : "/feeds");
  }

  function handleSelectFolder(folder: FolderResponse | null) {
    setSidebarOpen(false);
    router.push(folder ? `/feeds/folder/${folder.id}` : "/feeds");
  }

  return (
    <SidebarOpenContext.Provider value={sidebarOpen}>
      <MobileLeadingContext.Provider
        value={useMemo(
          () => (
            <button
              type="button"
              aria-label="open sidebar"
              className="btn btn-square btn-ghost"
              onClick={() => setSidebarOpen(true)}
            >
              <FontAwesomeIcon icon={faBars} />
            </button>
          ),
          [],
        )}
      >
        <Layout>
          <div className="flex flex-1 lg:h-full lg:overflow-hidden">
            {/* Mobile overlay */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-[55] bg-black/30 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Sidebar */}
            <aside
              className={`
              fixed inset-y-0 left-0 z-[60] w-72 bg-base-200 transition-transform duration-200 overflow-x-hidden overflow-y-auto
              lg:static lg:h-full lg:[translate:none] lg:z-auto
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            `}
            >
              <Menu
                selectedFeed={selectedFeed}
                selectedFolderId={selectedFolderId}
                onSelectFeed={handleSelectFeed}
                onSelectFolder={handleSelectFolder}
                onClose={() => setSidebarOpen(false)}
              />
            </aside>

            {/* Main content */}
            <div className="flex flex-col flex-1 min-w-0 lg:overflow-y-auto">
              <main className="flex-1 p-4">{children}</main>
            </div>
          </div>
        </Layout>
      </MobileLeadingContext.Provider>
    </SidebarOpenContext.Provider>
  );
}

export default function FeedsLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <FeedsLayoutInner>{children}</FeedsLayoutInner>
    </RequireAuth>
  );
}

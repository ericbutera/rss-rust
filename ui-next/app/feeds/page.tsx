"use client";

import { useState } from "react";
import Menu from "../../components/feeds/Menu";
import Viewer from "../../components/feeds/Viewer";
import Layout from "../../components/Layout";

export default function Feeds() {
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Sidebar — min 200px wide; outer aside has no overflow so tooltips can escape */}
        <aside
          className="bg-base-200 border-r border-base-300 shrink-0 flex flex-col relative z-10"
          style={{ minWidth: "200px", width: "256px" }}
        >
          <div className="flex-1 overflow-y-auto">
            <Menu
              selectedFeedId={selectedFeedId}
              onSelectFeed={setSelectedFeedId}
            />
          </div>
        </aside>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-4">
          {selectedFeedId !== null ? (
            <Viewer feedId={selectedFeedId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 opacity-40">
              <p className="text-lg">Select a feed to read articles</p>
            </div>
          )}
        </main>
      </div>
    </Layout>
  );
}

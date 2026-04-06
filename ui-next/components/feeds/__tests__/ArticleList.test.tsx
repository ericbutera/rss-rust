import type { ArticleResponse, FeedResponse } from "@/lib/queries";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ArticleList from "../ArticleList";

vi.mock("@/lib/queries", () => ({
  useToggleSaveArticle: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/config", () => ({
  API_URL: "http://localhost:3000/api",
}));

// ─── factories ────────────────────────────────────────────────────────────────

function makeArticle(
  overrides: Partial<ArticleResponse> = {},
): ArticleResponse {
  return {
    id: 1,
    feed_id: 10,
    url: "https://example.com/article",
    title: "Test Article Title",
    created_at: new Date(Date.now() - 60_000).toISOString(),
    updated_at: new Date().toISOString(),
    author: "Jane Doe",
    content: null,
    description: null,
    preview: "A short preview of the article",
    image_url: null,
    read_at: null,
    saved_at: null,
    guid: null,
    ...overrides,
  };
}

function makeFeed(overrides: Partial<FeedResponse> = {}): FeedResponse {
  return {
    id: 10,
    url: "https://example.com/feed.xml",
    name: "Example Feed",
    view_mode: "list",
    only_unread: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subscribed_at: new Date().toISOString(),
    sort_order: 0,
    unread_count: 0,
    favicon_url: null,
    folder_id: null,
    last_read_at: null,
    last_fetched_at: null,
    verified_at: null,
    ...overrides,
  };
}

const baseProps = {
  openArticleId: null as number | null,
  toggleArticle: vi.fn(),
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe("ArticleList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("article title", () => {
    it("renders article title in list view", () => {
      render(<ArticleList {...baseProps} articles={[makeArticle()]} />);
      expect(screen.getByText("Test Article Title")).toBeInTheDocument();
    });

    it("renders article title in cards view", () => {
      render(
        <ArticleList
          {...baseProps}
          articles={[makeArticle()]}
          viewMode="cards"
        />,
      );
      expect(screen.getByText("Test Article Title")).toBeInTheDocument();
    });

    it("renders article title in magazine view", () => {
      render(
        <ArticleList
          {...baseProps}
          articles={[makeArticle()]}
          viewMode="magazine"
        />,
      );
      expect(screen.getByText("Test Article Title")).toBeInTheDocument();
    });
  });

  describe("feed view — no feeds prop (single-feed context)", () => {
    it("shows article author in list view", () => {
      render(
        <ArticleList
          {...baseProps}
          articles={[makeArticle({ author: "Jane Doe" })]}
        />,
      );
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    it("shows article author in cards view", () => {
      render(
        <ArticleList
          {...baseProps}
          articles={[makeArticle({ author: "Jane Doe" })]}
          viewMode="cards"
        />,
      );
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    it("shows article author in magazine view", () => {
      render(
        <ArticleList
          {...baseProps}
          articles={[makeArticle({ author: "Jane Doe" })]}
          viewMode="magazine"
        />,
      );
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    it("does not show feed label when feeds prop is absent", () => {
      const article = makeArticle({ author: "Jane Doe" });
      render(<ArticleList {...baseProps} articles={[article]} />);
      // Feed name should not appear anywhere
      expect(screen.queryByText("Example Feed")).not.toBeInTheDocument();
    });

    it("renders nothing for author slot when author is null", () => {
      const { container } = render(
        <ArticleList
          {...baseProps}
          articles={[makeArticle({ author: null })]}
        />,
      );
      // ArticleAuthor returns null when author is falsy — no text outside the title
      expect(
        container.querySelector(".text-xs.opacity-40.truncate"),
      ).not.toBeInTheDocument();
    });
  });

  describe("folder view — feeds prop provided", () => {
    it("shows feed name in list view", () => {
      const feed = makeFeed({ id: 10, name: "My Tech Feed" });
      const article = makeArticle({ feed_id: 10 });
      render(
        <ArticleList {...baseProps} articles={[article]} feeds={[feed]} />,
      );
      expect(screen.getByText("My Tech Feed")).toBeInTheDocument();
    });

    it("shows feed name in cards view", () => {
      const feed = makeFeed({ id: 10, name: "My Tech Feed" });
      const article = makeArticle({ feed_id: 10 });
      render(
        <ArticleList
          {...baseProps}
          articles={[article]}
          feeds={[feed]}
          viewMode="cards"
        />,
      );
      expect(screen.getByText("My Tech Feed")).toBeInTheDocument();
    });

    it("shows feed name in magazine view", () => {
      const feed = makeFeed({ id: 10, name: "My Tech Feed" });
      const article = makeArticle({ feed_id: 10 });
      render(
        <ArticleList
          {...baseProps}
          articles={[article]}
          feeds={[feed]}
          viewMode="magazine"
        />,
      );
      expect(screen.getByText("My Tech Feed")).toBeInTheDocument();
    });

    it("does not show article author in folder view", () => {
      const feed = makeFeed({ id: 10, name: "My Tech Feed" });
      const article = makeArticle({ feed_id: 10, author: "Jane Doe" });
      render(
        <ArticleList {...baseProps} articles={[article]} feeds={[feed]} />,
      );
      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    });

    it("shows multiple feed names for articles from different feeds", () => {
      const feed1 = makeFeed({ id: 10, name: "Feed Alpha" });
      const feed2 = makeFeed({ id: 20, name: "Feed Beta" });
      const a1 = makeArticle({ id: 1, feed_id: 10 });
      const a2 = makeArticle({ id: 2, feed_id: 20 });
      render(
        <ArticleList
          {...baseProps}
          articles={[a1, a2]}
          feeds={[feed1, feed2]}
        />,
      );
      expect(screen.getByText("Feed Alpha")).toBeInTheDocument();
      expect(screen.getByText("Feed Beta")).toBeInTheDocument();
    });
  });

  describe("read state", () => {
    it("applies opacity class to read articles in list view", () => {
      const readArticle = makeArticle({
        read_at: new Date(Date.now() - 3600_000).toISOString(),
      });
      const { container } = render(
        <ArticleList {...baseProps} articles={[readArticle]} />,
      );
      // read + not open → bg-base-200
      const collapseEl = container.querySelector(".collapse");
      expect(collapseEl?.className).toContain("bg-base-200");
    });

    it("does not apply read styling to unread articles", () => {
      const unreadArticle = makeArticle({ read_at: null });
      const { container } = render(
        <ArticleList {...baseProps} articles={[unreadArticle]} />,
      );
      const collapseEl = container.querySelector(".collapse");
      expect(collapseEl?.className).toContain("bg-base-100");
    });
  });

  describe("empty list", () => {
    it("renders an empty container when articles array is empty", () => {
      const { container } = render(
        <ArticleList {...baseProps} articles={[]} />,
      );
      // The outer div exists but has no article children
      const listEl = container.querySelector(".article-list");
      expect(listEl).toBeInTheDocument();
      expect(listEl?.children).toHaveLength(0);
    });
  });
});

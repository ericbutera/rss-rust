import type { ArticleResponse, FeedResponse } from "@/lib/queries";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Viewer from "../Viewer";

// ─── hoisted mocks (available inside vi.mock factories) ────────────────────

const mocks = vi.hoisted(() => ({
  updateFeedView: vi.fn().mockResolvedValue(undefined),
  markArticleRead: vi.fn(),
  markFeedRead: vi.fn(),
  toggleSave: vi.fn(),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  feedArticles: vi.fn(),
  article: vi.fn(),
}));

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock("@/lib/queries", () => ({
  useFeedArticles: mocks.feedArticles,
  useMarkArticleRead: () => ({ mutate: mocks.markArticleRead }),
  useMarkFeedRead: () => ({ mutate: mocks.markFeedRead }),
  useToggleSaveArticle: () => ({ mutate: mocks.toggleSave }),
  useUnsubscribeFeed: () => ({ mutateAsync: mocks.unsubscribe }),
  useUpdateFeedView: () => ({ mutateAsync: mocks.updateFeedView }),
  useArticle: mocks.article,
}));

vi.mock("@/lib/useArticleKeyboardNav", () => ({
  useArticleKeyboardNav: () => undefined,
}));

vi.mock("@/lib/useViewPreferences", () => ({
  useViewPreferences: () => ({
    prefs: { density: "default", textSize: "base" },
    setDensity: vi.fn(),
    setTextSize: vi.fn(),
  }),
}));

// Stub heavy child components so only Viewer's own logic is tested
vi.mock("@/components/feeds/ViewHeader", () => ({
  default: ({
    onToggleUnread,
    onlyUnread,
    onViewModeChange,
  }: {
    onToggleUnread: () => void;
    onlyUnread: boolean;
    onViewModeChange: (mode: string) => void;
  }) => (
    <div data-testid="view-header" data-only-unread={String(onlyUnread)}>
      <button data-testid="toggle-unread-btn" onClick={onToggleUnread}>
        Toggle Unread
      </button>
      <button
        data-testid="change-view-mode-btn"
        onClick={() => onViewModeChange("cards")}
      >
        Change Mode
      </button>
    </div>
  ),
}));

vi.mock("@/components/feeds/FetchHistoryModal", () => ({
  default: () => <div data-testid="fetch-history-modal" />,
}));

vi.mock("@/components/feeds/ArticleList", () => ({
  default: () => <div data-testid="article-list" />,
}));

vi.mock("@/components/ui/LoadingSpinner", () => ({
  default: () => <div data-testid="loading-spinner" />,
}));

// ─── factories ─────────────────────────────────────────────────────────────

const defaultFeedArticlesResult = {
  data: { pages: [{ data: [], meta: { total: 0, page: 1, per_page: 20 } }] },
  isLoading: false,
  isError: false,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};

function makeFeed(overrides: Partial<FeedResponse> = {}): FeedResponse {
  return {
    id: 1,
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

function makeArticle(
  overrides: Partial<ArticleResponse> = {},
): ArticleResponse {
  return {
    id: 1,
    feed_id: 1,
    url: "https://example.com/a",
    title: "Article One",
    created_at: new Date(Date.now() - 60_000).toISOString(),
    updated_at: new Date().toISOString(),
    author: null,
    content: null,
    description: null,
    preview: null,
    image_url: null,
    read_at: null,
    saved_at: null,
    guid: null,
    ...overrides,
  };
}

const defaultProps = {
  openArticleId: null as number | null,
  onToggleArticle: vi.fn(),
  onUnsubscribed: vi.fn(),
};

// ─── tests ─────────────────────────────────────────────────────────────────

describe("Viewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feedArticles.mockReturnValue(defaultFeedArticlesResult);
    mocks.article.mockReturnValue({ data: null });
  });

  it("renders the ViewHeader", () => {
    render(<Viewer {...defaultProps} feed={makeFeed()} />);
    expect(screen.getByTestId("view-header")).toBeInTheDocument();
  });

  describe("onlyUnread initialisation", () => {
    it("passes only_unread=false to ViewHeader when feed.only_unread is false", () => {
      render(
        <Viewer {...defaultProps} feed={makeFeed({ only_unread: false })} />,
      );
      expect(screen.getByTestId("view-header")).toHaveAttribute(
        "data-only-unread",
        "false",
      );
    });

    it("passes only_unread=true to ViewHeader when feed.only_unread is true", () => {
      render(
        <Viewer {...defaultProps} feed={makeFeed({ only_unread: true })} />,
      );
      expect(screen.getByTestId("view-header")).toHaveAttribute(
        "data-only-unread",
        "true",
      );
    });
  });

  describe("toggle unread", () => {
    it("calls updateFeedView with (feedId, viewMode, true) when toggling from false", async () => {
      const user = userEvent.setup();
      const feed = makeFeed({ id: 42, view_mode: "list", only_unread: false });
      render(<Viewer {...defaultProps} feed={feed} />);

      await user.click(screen.getByTestId("toggle-unread-btn"));

      expect(mocks.updateFeedView).toHaveBeenCalledWith(42, "list", true);
    });

    it("calls updateFeedView with (feedId, viewMode, false) when toggling from true", async () => {
      const user = userEvent.setup();
      const feed = makeFeed({ id: 7, view_mode: "cards", only_unread: true });
      render(<Viewer {...defaultProps} feed={feed} />);

      await user.click(screen.getByTestId("toggle-unread-btn"));

      expect(mocks.updateFeedView).toHaveBeenCalledWith(7, "cards", false);
    });

    it("flips ViewHeader only_unread attribute after toggle", async () => {
      const user = userEvent.setup();
      render(
        <Viewer {...defaultProps} feed={makeFeed({ only_unread: false })} />,
      );

      await user.click(screen.getByTestId("toggle-unread-btn"));

      expect(screen.getByTestId("view-header")).toHaveAttribute(
        "data-only-unread",
        "true",
      );
    });
  });

  describe("empty state messages", () => {
    it("shows 'No articles yet.' when not loading and articles empty", () => {
      render(
        <Viewer {...defaultProps} feed={makeFeed({ only_unread: false })} />,
      );
      expect(screen.getByText("No articles yet.")).toBeInTheDocument();
    });

    it("shows 'No unread articles in this feed.' when onlyUnread=true and empty", () => {
      render(
        <Viewer {...defaultProps} feed={makeFeed({ only_unread: true })} />,
      );
      expect(
        screen.getByText("No unread articles in this feed."),
      ).toBeInTheDocument();
    });

    it("does not show empty message while loading", () => {
      mocks.feedArticles.mockReturnValue({
        ...defaultFeedArticlesResult,
        data: undefined,
        isLoading: true,
      });
      render(<Viewer {...defaultProps} feed={makeFeed()} />);
      expect(screen.queryByText("No articles yet.")).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows LoadingSpinner when isLoading=true", () => {
      mocks.feedArticles.mockReturnValue({
        ...defaultFeedArticlesResult,
        data: undefined,
        isLoading: true,
      });
      render(<Viewer {...defaultProps} feed={makeFeed()} />);
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    });

    it("does not show spinner when not loading", () => {
      render(<Viewer {...defaultProps} feed={makeFeed()} />);
      expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message when isError=true", () => {
      mocks.feedArticles.mockReturnValue({
        ...defaultFeedArticlesResult,
        data: undefined,
        isError: true,
      });
      render(<Viewer {...defaultProps} feed={makeFeed()} />);
      expect(screen.getByText("Failed to load articles.")).toBeInTheDocument();
    });
  });

  describe("articles list", () => {
    it("renders ArticleList when articles are present", () => {
      mocks.feedArticles.mockReturnValue({
        ...defaultFeedArticlesResult,
        data: {
          pages: [
            {
              data: [makeArticle()],
              meta: { total: 1, page: 1, per_page: 20 },
            },
          ],
        },
      });
      render(<Viewer {...defaultProps} feed={makeFeed()} />);
      expect(screen.getByTestId("article-list")).toBeInTheDocument();
    });
  });
});

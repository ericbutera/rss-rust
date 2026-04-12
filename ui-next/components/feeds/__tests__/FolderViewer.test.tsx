import type {
  ArticleResponse,
  FeedResponse,
  FolderResponse,
} from "@/lib/queries";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FolderViewer from "../FolderViewer";

// ─── hoisted mocks ─────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  updateFolderView: vi.fn().mockResolvedValue(undefined),
  markArticleRead: vi.fn(),
  markFolderRead: vi.fn(),
  toggleSave: vi.fn(),
  folderArticles: vi.fn(),
  article: vi.fn(),
  feeds: vi.fn(),
}));

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock("@/lib/queries", () => ({
  useFolderArticles: mocks.folderArticles,
  useMarkArticleRead: () => ({ mutate: mocks.markArticleRead }),
  useMarkFolderRead: () => ({ mutate: mocks.markFolderRead }),
  useToggleSaveArticle: () => ({ mutate: mocks.toggleSave }),
  useUpdateFolderView: () => ({ mutateAsync: mocks.updateFolderView }),
  useArticle: mocks.article,
  useFeeds: mocks.feeds,
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

vi.mock("@/components/feeds/FolderViewHeader", () => ({
  default: ({
    onToggleUnread,
    onlyUnread,
    onViewModeChange,
  }: {
    onToggleUnread: () => void;
    onlyUnread: boolean;
    onViewModeChange: (mode: string) => void;
  }) => (
    <div data-testid="folder-view-header" data-only-unread={String(onlyUnread)}>
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

vi.mock("@/components/feeds/ArticleList", () => ({
  default: ({ articles }: { articles: ArticleResponse[] }) => (
    <div data-testid="article-list" data-count={articles.length} />
  ),
}));

vi.mock("@/components/ui/LoadingSpinner", () => ({
  default: () => <div data-testid="loading-spinner" />,
}));

// ─── factories ─────────────────────────────────────────────────────────────

const defaultFolderArticlesResult = {
  data: { pages: [{ data: [], meta: { total: 0, page: 1, per_page: 20 } }] },
  isLoading: false,
  isError: false,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};

function makeFolder(overrides: Partial<FolderResponse> = {}): FolderResponse {
  return {
    id: 10,
    name: "My Folder",
    view_mode: "list",
    only_unread: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sort_order: 0,
    unread_count: 0,
    ...overrides,
  };
}

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
    folder_id: 10,
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
    title: "Folder Article",
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
};

// ─── tests ─────────────────────────────────────────────────────────────────

describe("FolderViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.folderArticles.mockReturnValue(defaultFolderArticlesResult);
    mocks.article.mockReturnValue({ data: null });
    mocks.feeds.mockReturnValue({ data: [makeFeed()] });
  });

  it("renders the FolderViewHeader", () => {
    render(<FolderViewer {...defaultProps} folder={makeFolder()} />);
    expect(screen.getByTestId("folder-view-header")).toBeInTheDocument();
  });

  describe("onlyUnread initialisation", () => {
    it("passes only_unread=false when folder.only_unread is false", () => {
      render(
        <FolderViewer
          {...defaultProps}
          folder={makeFolder({ only_unread: false })}
        />,
      );
      expect(screen.getByTestId("folder-view-header")).toHaveAttribute(
        "data-only-unread",
        "false",
      );
    });

    it("passes only_unread=true when folder.only_unread is true", () => {
      render(
        <FolderViewer
          {...defaultProps}
          folder={makeFolder({ only_unread: true })}
        />,
      );
      expect(screen.getByTestId("folder-view-header")).toHaveAttribute(
        "data-only-unread",
        "true",
      );
    });
  });

  describe("toggle unread", () => {
    it("calls updateFolderView with (folderId, viewMode, true) when toggling from false", async () => {
      const user = userEvent.setup();
      const folder = makeFolder({
        id: 10,
        view_mode: "list",
        only_unread: false,
      });
      render(<FolderViewer {...defaultProps} folder={folder} />);

      await user.click(screen.getByTestId("toggle-unread-btn"));

      expect(mocks.updateFolderView).toHaveBeenCalledWith(10, "list", true);
    });

    it("calls updateFolderView with (folderId, viewMode, false) when toggling from true", async () => {
      const user = userEvent.setup();
      const folder = makeFolder({
        id: 5,
        view_mode: "magazine",
        only_unread: true,
      });
      render(<FolderViewer {...defaultProps} folder={folder} />);

      await user.click(screen.getByTestId("toggle-unread-btn"));

      expect(mocks.updateFolderView).toHaveBeenCalledWith(5, "magazine", false);
    });

    it("flips FolderViewHeader only_unread attribute after toggle", async () => {
      const user = userEvent.setup();
      render(
        <FolderViewer
          {...defaultProps}
          folder={makeFolder({ only_unread: false })}
        />,
      );

      await user.click(screen.getByTestId("toggle-unread-btn"));

      expect(screen.getByTestId("folder-view-header")).toHaveAttribute(
        "data-only-unread",
        "true",
      );
    });
  });

  describe("empty state messages", () => {
    it("shows 'No articles in this folder yet.' when not loading and empty", () => {
      render(
        <FolderViewer
          {...defaultProps}
          folder={makeFolder({ only_unread: false })}
        />,
      );
      expect(
        screen.getByText("No articles in this folder yet."),
      ).toBeInTheDocument();
    });

    it("shows 'No unread articles in this folder.' when onlyUnread=true and empty", () => {
      render(
        <FolderViewer
          {...defaultProps}
          folder={makeFolder({ only_unread: true })}
        />,
      );
      expect(
        screen.getByText("No unread articles in this folder."),
      ).toBeInTheDocument();
    });

    it("does not show empty message while loading", () => {
      mocks.folderArticles.mockReturnValue({
        ...defaultFolderArticlesResult,
        data: undefined,
        isLoading: true,
      });
      render(<FolderViewer {...defaultProps} folder={makeFolder()} />);
      expect(
        screen.queryByText("No articles in this folder yet."),
      ).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows LoadingSpinner when isLoading=true", () => {
      mocks.folderArticles.mockReturnValue({
        ...defaultFolderArticlesResult,
        data: undefined,
        isLoading: true,
      });
      render(<FolderViewer {...defaultProps} folder={makeFolder()} />);
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    });

    it("does not show spinner when not loading", () => {
      render(<FolderViewer {...defaultProps} folder={makeFolder()} />);
      expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message when isError=true", () => {
      mocks.folderArticles.mockReturnValue({
        ...defaultFolderArticlesResult,
        data: undefined,
        isError: true,
      });
      render(<FolderViewer {...defaultProps} folder={makeFolder()} />);
      expect(screen.getByText("Failed to load articles.")).toBeInTheDocument();
    });
  });

  describe("articles list", () => {
    it("renders ArticleList when articles are present", () => {
      mocks.folderArticles.mockReturnValue({
        ...defaultFolderArticlesResult,
        data: {
          pages: [
            {
              data: [makeArticle()],
              meta: { total: 1, page: 1, per_page: 20 },
            },
          ],
        },
      });
      render(<FolderViewer {...defaultProps} folder={makeFolder()} />);
      expect(screen.getByTestId("article-list")).toBeInTheDocument();
    });

    it("passes feeds from useFeeds to ArticleList", () => {
      const feeds = [makeFeed({ id: 1 }), makeFeed({ id: 2, name: "Feed 2" })];
      mocks.feeds.mockReturnValue({ data: feeds });
      mocks.folderArticles.mockReturnValue({
        ...defaultFolderArticlesResult,
        data: {
          pages: [
            {
              data: [makeArticle()],
              meta: { total: 1, page: 1, per_page: 20 },
            },
          ],
        },
      });
      render(<FolderViewer {...defaultProps} folder={makeFolder()} />);
      expect(screen.getByTestId("article-list")).toBeInTheDocument();
    });

    it("keeps opened article in list after onlyUnread refetch removes it", () => {
      const article = makeArticle({ id: 99, read_at: null });

      // Initial render: article is in the paged list and fullOpenArticle is available
      mocks.folderArticles.mockReturnValue({
        ...defaultFolderArticlesResult,
        data: {
          pages: [
            { data: [article], meta: { total: 1, page: 1, per_page: 20 } },
          ],
        },
      });
      mocks.article.mockReturnValue({ data: article });

      const { rerender } = render(
        <FolderViewer
          {...defaultProps}
          openArticleId={99}
          folder={makeFolder({ only_unread: true })}
        />,
      );

      // Simulate refetch after mark-read: paged list is now empty
      mocks.folderArticles.mockReturnValue({
        ...defaultFolderArticlesResult,
        data: {
          pages: [{ data: [], meta: { total: 0, page: 1, per_page: 20 } }],
        },
      });

      rerender(
        <FolderViewer
          {...defaultProps}
          openArticleId={99}
          folder={makeFolder({ only_unread: true })}
        />,
      );

      // Pinned article keeps count at 1
      expect(screen.getByTestId("article-list")).toHaveAttribute(
        "data-count",
        "1",
      );
    });
  });
});

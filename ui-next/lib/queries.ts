import type { components, paths } from "@/lib/react-query/api";
import { createClient, createFetchClient } from "@ericbutera/kaleido";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "./config";

const fetchClient = createFetchClient({ baseUrl: API_URL });
export const $api = createClient<paths>(fetchClient);

export type FeedResponse = components["schemas"]["FeedResponse"];
export type ArticleResponse = components["schemas"]["ArticleResponse"];
export type ArticlesPage =
  components["schemas"]["PaginatedResponse_ArticleResponse"];
export type CreateFeedRequest = components["schemas"]["CreateFeedRequest"];
export type CreateFeedResponse = components["schemas"]["CreateFeedResponse"];
export type FetchHistoryResponse =
  components["schemas"]["FetchHistoryResponse"];
export type FetchHistoryPage =
  components["schemas"]["PaginatedResponse_FetchHistoryResponse"];
export type AdminFeed = components["schemas"]["AdminFeedResponse"];
export type AdminUpdateFeedRequest =
  components["schemas"]["AdminUpdateFeedRequest"];
export type TaskStatusResponse = components["schemas"]["TaskStatusResponse"];
// Historically this was named `AdminAggregatesResponse` in the client
// generator. The OpenAPI types now expose these metrics as `SystemMetrics`.
// Keep a compatibility alias so existing code continues to compile.
export type AdminAggregatesResponse = components["schemas"]["SystemMetrics"];
export type SystemMetrics = components["schemas"]["SystemMetrics"];
export type NamedStat = components["schemas"]["NamedStat"];
// `StatResult` was removed from the OpenAPI schema. Define it locally to match
// the shape expected by kaleido's admin components (value + optional error).
export type StatResult = { value: number; error?: string | null };
export type FolderResponse = components["schemas"]["FolderResponse"];

export function useFeeds() {
  const resp = $api.useQuery("get", "/feeds", {});
  return { ...resp, data: (resp.data ?? []) as FeedResponse[] };
}

export function useFeedArticles(
  feedId: number | null,
  onlySaved = false,
  onlyUnread = false,
) {
  return useInfiniteQuery<ArticlesPage, Error>({
    queryKey: ["feeds", feedId, "articles", { onlySaved, onlyUnread }],
    enabled: feedId !== null,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        per_page: "20",
      });
      if (onlySaved) params.set("only_saved", "true");
      if (onlyUnread) params.set("only_unread", "true");
      const url = `${API_URL}/feeds/${feedId}/articles?${params}`;
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json() as Promise<ArticlesPage>;
    },
    getNextPageParam: (lastPage: ArticlesPage) => {
      const { page, total_pages } = lastPage.metadata;
      return page < total_pages ? page + 1 : undefined;
    },
  });
}

export function useCreateFeed() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("post", "/feeds");

  return {
    ...mutation,
    mutateAsync: async (
      data: CreateFeedRequest,
    ): Promise<CreateFeedResponse> => {
      const result = await mutation.mutateAsync({ body: data });
      await queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
      return result as CreateFeedResponse;
    },
  };
}

export function useMarkFeedRead() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/feeds/{id}/read");
  return {
    ...mutation,
    mutate: (vars: Parameters<typeof mutation.mutate>[0]) => {
      mutation.mutate(vars, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
        },
      });
    },
  };
}

export function useUnsubscribeFeed() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("delete", "/feeds/{id}");
  return {
    ...mutation,
    mutateAsync: async (feedId: number) => {
      await mutation.mutateAsync({ params: { path: { id: feedId } } });
      await queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
    },
  };
}

export function useReorderFeeds() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/feeds/reorder");
  return {
    ...mutation,
    mutateAsync: async (
      items: { feed_id: number; sort_order: number }[],
    ): Promise<void> => {
      await mutation.mutateAsync({ body: items });
      await queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
    },
  };
}

export function useMarkArticleRead() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/articles/{id}/read");
  return {
    ...mutation,
    mutate: (vars: Parameters<typeof mutation.mutate>[0], feedId?: number) => {
      mutation.mutate(vars, {
        onSuccess: () => {
          if (feedId !== undefined) {
            queryClient.invalidateQueries({
              queryKey: ["feeds", feedId, "articles"],
            });
            queryClient.invalidateQueries({
              queryKey: ["get", "/feeds"],
            });
          }
          // Always refresh folder article lists and folder unread counts so that
          // marking an article read from a folder view updates immediately.
          queryClient.invalidateQueries({ queryKey: ["folders"] });
          queryClient.invalidateQueries({ queryKey: ["get", "/folders"] });
        },
      });
    },
  };
}

export function useToggleSaveArticle() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/articles/{id}/save");
  return {
    ...mutation,
    mutate: (articleId: number, feedId: number) => {
      // Optimistic update: flip saved_at immediately in all cached article pages
      // (covers both feed-level and folder-level article caches).
      const now = new Date().toISOString();
      type PagedArticles = { pages: { data: ArticleResponse[] }[] };
      const flipArticle = (a: ArticleResponse): ArticleResponse =>
        a.id === articleId ? { ...a, saved_at: a.saved_at ? null : now } : a;
      const flipPages = (old: PagedArticles | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            data: p.data.map(flipArticle),
          })),
        };
      };
      queryClient.setQueriesData<PagedArticles>(
        { queryKey: ["feeds", feedId, "articles"], exact: false },
        flipPages,
      );
      queryClient.setQueriesData<PagedArticles>(
        { queryKey: ["folders"], exact: false },
        flipPages,
      );

      mutation.mutate(
        { params: { path: { id: articleId } } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: ["feeds", feedId, "articles"],
            });
            queryClient.invalidateQueries({ queryKey: ["folders"] });
          },
          onError: () => {
            // Revert: flip back (toggle is its own inverse)
            queryClient.setQueriesData<PagedArticles>(
              { queryKey: ["feeds", feedId, "articles"], exact: false },
              flipPages,
            );
            queryClient.setQueriesData<PagedArticles>(
              { queryKey: ["folders"], exact: false },
              flipPages,
            );
          },
        },
      );
    },
  };
}

export function useFetchHistory(feedId: number | null, page = 1) {
  return $api.useQuery(
    "get",
    "/feeds/{id}/fetch-history",
    { params: { path: { id: feedId ?? 0 }, query: { page, per_page: 20 } } },
    { enabled: feedId !== null },
  );
}

export function useTaskStatus(taskId: string | null) {
  return $api.useQuery(
    "get",
    "/feeds/tasks/{task_id}" as never,
    { params: { path: { task_id: taskId ?? "" } } } as never,
    {
      enabled: taskId !== null && taskId !== "",
      // Poll every 2 seconds until the task reaches a terminal state
      refetchInterval: (query: { state: { data: unknown } }) => {
        const status = (query.state.data as TaskStatusResponse | undefined)
          ?.status;
        return status === "completed" || status === "failed" ? false : 2000;
      },
    },
  );
}

export function useAdminFeeds() {
  const resp = $api.useQuery("get", "/admin/feeds", {});
  return { ...resp, data: (resp.data ?? []) as AdminFeed[] };
}

export function useAdminFetchNow() {
  return $api.useMutation("post", "/admin/feeds/{id}/fetch-now");
}

export function useArticle(articleId: number | null) {
  return $api.useQuery(
    "get",
    "/articles/{id}",
    { params: { path: { id: articleId ?? 0 } } },
    { enabled: articleId !== null },
  );
}

export function useAdminFeedHistory(feedId: number | null, page = 1) {
  return $api.useQuery(
    "get",
    "/admin/feeds/{id}/fetch-history",
    { params: { path: { id: feedId ?? 0 }, query: { page, per_page: 20 } } },
    { enabled: feedId !== null },
  );
}

export function useUpdateAdminFeed() {
  return $api.useMutation("put", "/admin/feeds/{id}");
}

export function useAdminMetrics() {
  return $api.useQuery("get", "/admin/metrics", {});
}

export function useAdminAppMetrics() {
  return $api.useQuery("get", "/admin/metrics/app", {});
}

export function useRenameFeed() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/feeds/{id}/name");
  return {
    ...mutation,
    mutateAsync: async (feedId: number, name: string | null): Promise<void> => {
      await mutation.mutateAsync({
        params: { path: { id: feedId } },
        body: { name },
      });
      await queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
    },
  };
}

export function useUpdateFeedView() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/feeds/{id}/view");
  return {
    ...mutation,
    mutateAsync: async (
      feedId: number,
      viewMode: string,
      onlyUnread?: boolean | null,
    ): Promise<void> => {
      await mutation.mutateAsync({
        params: { path: { id: feedId } },
        body: { view_mode: viewMode, only_unread: onlyUnread ?? null },
      });
      await queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
    },
  };
}

export function useUpdateFolderView() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/folders/{id}/view");
  return {
    ...mutation,
    mutateAsync: async (
      folderId: number,
      viewMode: string,
      onlyUnread?: boolean | null,
    ): Promise<void> => {
      await mutation.mutateAsync({
        params: { path: { id: folderId } },
        body: { view_mode: viewMode, only_unread: onlyUnread ?? null },
      });
      await queryClient.invalidateQueries({ queryKey: ["get", "/folders"] });
    },
  };
}

export function useFolders() {
  const resp = $api.useQuery("get", "/folders", {});
  return { ...resp, data: (resp.data ?? []) as FolderResponse[] };
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("post", "/folders");
  return {
    ...mutation,
    mutateAsync: async (name: string): Promise<FolderResponse> => {
      const result = await mutation.mutateAsync({ body: { name } });
      await queryClient.invalidateQueries({ queryKey: ["get", "/folders"] });
      return result as FolderResponse;
    },
  };
}

export function useRenameFolder() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/folders/{id}/name");
  return {
    ...mutation,
    mutateAsync: async (folderId: number, name: string): Promise<void> => {
      await mutation.mutateAsync({
        params: { path: { id: folderId } },
        body: { name },
      });
      await queryClient.invalidateQueries({ queryKey: ["get", "/folders"] });
    },
  };
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("delete", "/folders/{id}");
  return {
    ...mutation,
    mutateAsync: async (folderId: number): Promise<void> => {
      await mutation.mutateAsync({ params: { path: { id: folderId } } });
      await queryClient.invalidateQueries({ queryKey: ["get", "/folders"] });
      await queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
    },
  };
}

export function useAssignFeedToFolder() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/feeds/{id}/folder");
  return {
    ...mutation,
    mutateAsync: async (
      feedId: number,
      folderId: number | null,
    ): Promise<void> => {
      await mutation.mutateAsync({
        params: { path: { id: feedId } },
        body: { folder_id: folderId },
      });
      await queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
    },
  };
}

export function useMarkFolderRead() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("put", "/feeds/{id}/read");
  return {
    mutate: (feedIds: number[]) => {
      let pending = feedIds.length;
      if (pending === 0) return;
      feedIds.forEach((feedId) => {
        mutation.mutate(
          { params: { path: { id: feedId } } },
          {
            onSuccess: () => {
              pending -= 1;
              if (pending === 0) {
                queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
                queryClient.invalidateQueries({
                  queryKey: ["get", "/folders"],
                });
              }
            },
          },
        );
      });
    },
  };
}

export function useFolderArticles(
  folderId: number | null,
  onlySaved = false,
  onlyUnread = false,
) {
  return useInfiniteQuery<
    components["schemas"]["PaginatedResponse_ArticleResponse"],
    Error
  >({
    queryKey: ["folders", folderId, "articles", { onlySaved, onlyUnread }],
    enabled: folderId !== null,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        per_page: "20",
      });
      if (onlySaved) params.set("only_saved", "true");
      if (onlyUnread) params.set("only_unread", "true");
      const url = `${API_URL}/folders/${folderId}/articles?${params}`;
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json() as Promise<
        components["schemas"]["PaginatedResponse_ArticleResponse"]
      >;
    },
    getNextPageParam: (
      lastPage: components["schemas"]["PaginatedResponse_ArticleResponse"],
    ) => {
      const { page, total_pages } = lastPage.metadata;
      return page < total_pages ? page + 1 : undefined;
    },
  });
}

export function useInvalidateFeeds() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
}

export function useFixUnreadDrift() {
  return $api.useMutation("post", "/admin/tasks/fix-unread-drift");
}

export function useFetchMissingFavicons() {
  return $api.useMutation("post", "/admin/tasks/fetch-missing-favicons");
}

import type { components, paths } from "@/lib/react-query/api";
import { createClient, createFetchClient } from "@ericbutera/kaleido";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "./config";

const fetchClient = createFetchClient({ baseUrl: API_URL });
export const $api = createClient<paths>(fetchClient);

// ── Type aliases ──────────────────────────────────────────────────────────────
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
export type AdminAggregatesResponse =
  components["schemas"]["AdminAggregatesResponse"];
export type SystemMetrics = components["schemas"]["SystemMetrics"];
export type NamedStat = components["schemas"]["NamedStat"];
export type StatResult = components["schemas"]["StatResult"];

// ── Feed queries ──────────────────────────────────────────────────────────────

export function useFeeds() {
  const resp = $api.useQuery("get", "/feeds", {});
  return { ...resp, data: resp.data ?? [] };
}

export function useFeedArticles(feedId: number | null, onlySaved = false) {
  return useInfiniteQuery<ArticlesPage, Error>({
    queryKey: ["feeds", feedId, "articles", { onlySaved }],
    enabled: feedId !== null,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const savedParam = onlySaved ? "&only_saved=true" : "";
      const url = `${API_URL}/feeds/${feedId}/articles?page=${pageParam}&per_page=20${savedParam}`;
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
      mutation.mutate(
        { params: { path: { id: articleId } } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: ["feeds", feedId, "articles"],
            });
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
      refetchInterval: (query) => {
        const status = (query.state.data as TaskStatusResponse | undefined)
          ?.status;
        return status === "completed" || status === "failed" ? false : 2000;
      },
    },
  );
}

// ── Admin queries ─────────────────────────────────────────────────────────────

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

// ── Invalidation helpers ──────────────────────────────────────────────────────

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

export function useInvalidateFeeds() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
}

export function useFixUnreadDrift() {
  return $api.useMutation("post", "/admin/tasks/fix-unread-drift");
}

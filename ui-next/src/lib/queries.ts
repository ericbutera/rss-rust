import { createClient, createFetchClient } from "@ericbutera/kaleido";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "./config";
import type { components, paths } from "./openapi/react-query/api";

const fetchClient = createFetchClient({ baseUrl: API_URL });
export const $api = createClient<paths>(fetchClient);

// ── Type aliases ──────────────────────────────────────────────────────────────
export type FeedResponse = components["schemas"]["FeedResponse"];
export type ArticleResponse = components["schemas"]["ArticleResponse"];
export type ArticlesPage = components["schemas"]["ArticlesPage"];
export type CreateFeedRequest = components["schemas"]["CreateFeedRequest"];
export type FetchHistoryResponse =
  components["schemas"]["FetchHistoryResponse"];

// ── Feed queries ──────────────────────────────────────────────────────────────

export function useFeeds() {
  const resp = $api.useQuery("get", "/feeds", {});
  return { ...resp, data: resp.data ?? [] };
}

export function useFeedArticles(feedId: number | null) {
  return useInfiniteQuery<ArticlesPage, Error>({
    queryKey: ["feeds", feedId, "articles"],
    enabled: feedId !== null,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const url = `${API_URL}/feeds/${feedId}/articles?page=${pageParam}&per_page=20`;
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json() as Promise<ArticlesPage>;
    },
    getNextPageParam: (lastPage: ArticlesPage) =>
      lastPage.has_next ? lastPage.page + 1 : undefined,
  });
}

export function useCreateFeed() {
  const queryClient = useQueryClient();
  const mutation = $api.useMutation("post", "/feeds");

  return {
    ...mutation,
    mutateAsync: async (data: CreateFeedRequest) => {
      const result = await mutation.mutateAsync({ body: data });
      await queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
      return result;
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
          // Invalidate feeds list so last_read_at updates in menu
          queryClient.invalidateQueries({ queryKey: ["get", "/feeds"] });
        },
      });
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

export function useFetchHistory(feedId: number | null) {
  return $api.useQuery(
    "get",
    "/feeds/{id}/fetch-history",
    { params: { path: { id: feedId ?? 0 } } },
    { enabled: feedId !== null },
  );
}

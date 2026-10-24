import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { isBrowserOffline, isConnectionFailure, isSlowConnection } from "@/lib/network";
import { restoreQueryCache, startPersistingQueryCache } from "@/lib/query-persist";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const slow = isSlowConnection();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: slow ? 5 * 60_000 : 3 * 60_000,
        gcTime: 30 * 60_000,
        retry: (failureCount, error) =>
          !isBrowserOffline() && !isConnectionFailure(error) && failureCount < 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });

  restoreQueryCache(queryClient);
  startPersistingQueryCache(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: slow ? false : "intent",
    defaultPreloadStaleTime: 3 * 60_000,
  });

  return router;
};

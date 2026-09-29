import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { isSlowConnection } from "@/lib/network";
import { restoreQueryCache, startPersistingQueryCache } from "@/lib/query-persist";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const slow = isSlowConnection();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: slow ? 5 * 60_000 : 3 * 60_000,
        gcTime: 30 * 60_000,
        retry: 1,
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

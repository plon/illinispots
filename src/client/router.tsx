import { createRouter } from "@tanstack/react-router";
import { routeTree } from "@/client/routeTree.gen";

// TanStack's restoration copies nested scroll offsets onto new history entries,
// which leaks the list position into facility views sharing the same viewport.
// It stays off so LeftSidebar owns scrolling; re-enabling it would fight the
// manual save/restore there.
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

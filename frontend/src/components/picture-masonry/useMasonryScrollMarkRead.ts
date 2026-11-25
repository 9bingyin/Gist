import { useScrollMarkReadCore } from "@/hooks/useScrollMarkReadCore";
import type { Entry } from "@/types/api";
import type { ScrollSurface } from "@/components/entry-list/scroll-surface";

interface UseMasonryScrollMarkReadOptions {
  /** Container scoped to the masonry list (never documentElement) for observing mounted items. */
  observeRoot: HTMLElement | null;
  scrollSurface: ScrollSurface;
  entries: Entry[];
  enabled: boolean;
  unreadOnly: boolean;
  hasNextPage: boolean;
  resetKey: string;
}

export function useMasonryScrollMarkRead({
  observeRoot,
  scrollSurface,
  entries,
  enabled,
  unreadOnly,
  hasNextPage,
  resetKey,
}: UseMasonryScrollMarkReadOptions) {
  return useScrollMarkReadCore({
    surface: scrollSurface,
    observeRoot,
    entries,
    enabled,
    unreadOnly,
    hasNextPage,
    resetKey,
    observeMutations: true,
    scrollCompensation: "anchor",
  });
}

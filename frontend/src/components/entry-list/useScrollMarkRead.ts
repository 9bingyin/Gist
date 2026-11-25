import type { RefObject } from "react";
import { useScrollMarkReadCore } from "@/hooks/useScrollMarkReadCore";
import type { Entry } from "@/types/api";
import type { ScrollSurface } from "./scroll-surface";

interface UseScrollMarkReadOptions {
  surface: ScrollSurface;
  containerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  entries: Entry[];
  enabled: boolean;
  unreadOnly: boolean;
  hasNextPage: boolean;
  resetKey: string;
}

export function useScrollMarkRead({
  surface,
  containerRef,
  contentRef,
  entries,
  enabled,
  unreadOnly,
  hasNextPage,
  resetKey,
}: UseScrollMarkReadOptions) {
  return useScrollMarkReadCore({
    surface,
    observeRootRef: containerRef,
    contentElementRef: contentRef,
    measureElementRef: containerRef,
    entries,
    enabled,
    unreadOnly,
    hasNextPage,
    resetKey,
    observeMutations: false,
    scrollCompensation: "height",
  });
}

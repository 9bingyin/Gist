import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useMarkManyAsRead, useRemoveFromUnreadList } from "@/hooks/useEntries";
import type { Entry } from "@/types/api";
import type {
  ScrollSurface,
  ScrollViewportRect,
} from "@/components/entry-list/scroll-surface";

const MARK_READ_ON_SCROLL_BATCH_DELAY_MS = 200;
const MARK_READ_ON_SCROLL_GRACE_MS = 1000;

interface AnchorSnapshot {
  id: string;
  top: number;
}

function findVisibleAnchor(
  root: HTMLElement,
  viewport: ScrollViewportRect,
  excludingIds: Set<string>,
): AnchorSnapshot | null {
  let anchor: AnchorSnapshot | null = null;

  for (const item of root.querySelectorAll<HTMLElement>("[data-entry-id]")) {
    const entryId = item.dataset.entryId;
    if (!entryId || excludingIds.has(entryId)) continue;

    const rect = item.getBoundingClientRect();
    if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;
    if (!anchor || rect.top < anchor.top) {
      anchor = { id: entryId, top: rect.top };
    }
  }

  return anchor;
}

function findEntryElement(
  root: HTMLElement,
  entryId: string,
): HTMLElement | null {
  for (const item of root.querySelectorAll<HTMLElement>("[data-entry-id]")) {
    if (item.dataset.entryId === entryId) return item;
  }
  return null;
}

export interface UseScrollMarkReadCoreOptions {
  surface: ScrollSurface;
  /** Container element (or ref) that holds the `[data-entry-id]` items (never documentElement for MutationObserver). */
  observeRoot?: HTMLElement | null;
  observeRootRef?: RefObject<HTMLElement | null>;
  /** Optional real list content element ref for ResizeObserver (avoids observing loading skeletons). */
  contentElementRef?: RefObject<HTMLElement | null>;
  /** Element (or ref) whose scrollHeight represents natural content height; falls back to surface.getScrollHeight(). */
  measureElementRef?: RefObject<HTMLElement | null>;
  entries: Entry[];
  enabled: boolean;
  unreadOnly: boolean;
  hasNextPage: boolean;
  resetKey: string;
  observeMutations?: boolean;
  scrollCompensation: "height" | "anchor";
}

export interface UseScrollMarkReadCoreResult {
  endPaddingHeight: number;
}

export function useScrollMarkReadCore({
  surface,
  observeRoot,
  observeRootRef: externalObserveRootRef,
  contentElementRef,
  measureElementRef,
  entries,
  enabled,
  unreadOnly,
  hasNextPage,
  resetKey,
  observeMutations = false,
  scrollCompensation,
}: UseScrollMarkReadCoreOptions): UseScrollMarkReadCoreResult {
  const { mutate: markManyAsRead } = useMarkManyAsRead();
  const removeFromUnreadList = useRemoveFromUnreadList();

  const seenEntryIds = useRef(new Set<string>());
  const markedReadIds = useRef(new Set<string>());
  const pendingReadHeights = useRef(new Map<string, number>());
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef(0);
  const graceUntil = useRef(0);
  const [observerVersion, setObserverVersion] = useState(0);
  const endPaddingHeightRef = useRef(0);
  const internalObserveRootRef = useRef<HTMLElement | null>(
    observeRoot ?? null,
  );
  const unreadIdsRef = useRef<Set<string>>(new Set());

  const getObserveRoot = useCallback(
    () => externalObserveRootRef?.current ?? internalObserveRootRef.current,
    [externalObserveRootRef],
  );

  const [scrollLayout, setScrollLayout] = useState({
    viewportHeight: 0,
    naturalContentOverflows: false,
  });

  const entriesIdentityKey = useMemo(
    () => entries.map((entry) => entry.id).join("\u0000"),
    [entries],
  );
  const hasEntries = entries.length > 0;

  const unreadIds = useMemo(
    () =>
      new Set(entries.filter((entry) => !entry.read).map((entry) => entry.id)),
    [entries],
  );
  const hasUnreadEntries = unreadIds.size > 0;

  useEffect(() => {
    unreadIdsRef.current = unreadIds;
  }, [unreadIds]);

  const endPaddingHeight =
    enabled &&
    hasUnreadEntries &&
    !hasNextPage &&
    scrollLayout.naturalContentOverflows
      ? scrollLayout.viewportHeight
      : 0;

  useEffect(() => {
    internalObserveRootRef.current = observeRoot ?? null;
  }, [observeRoot]);

  useEffect(() => {
    endPaddingHeightRef.current = endPaddingHeight;
  }, [endPaddingHeight]);

  const measureScrollLayout = useCallback(() => {
    const rootNode = getObserveRoot();
    const measureNode = measureElementRef?.current ?? null;
    if (!rootNode && !measureNode) return;

    const viewportHeight = surface.getViewportRect().height;
    const rawScrollHeight = measureNode
      ? measureNode.scrollHeight
      : surface.getScrollHeight();
    const naturalScrollHeight = Math.max(
      0,
      rawScrollHeight - endPaddingHeightRef.current,
    );
    const naturalContentOverflows = naturalScrollHeight > viewportHeight + 1;

    setScrollLayout((current) => {
      if (
        current.viewportHeight === viewportHeight &&
        current.naturalContentOverflows === naturalContentOverflows
      ) {
        return current;
      }

      return { viewportHeight, naturalContentOverflows };
    });
  }, [getObserveRoot, measureElementRef, surface]);

  useEffect(() => {
    const rootNode = getObserveRoot();
    const measureNode = measureElementRef?.current ?? null;
    const contentNode = contentElementRef?.current ?? null;
    if (!rootNode && !measureNode) return;

    measureScrollLayout();
    const handleResize = () => measureScrollLayout();
    if (surface.kind === "document") {
      window.addEventListener("resize", handleResize);
    }

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", handleResize);
    }

    const observer = new ResizeObserver(measureScrollLayout);
    if (measureNode) observer.observe(measureNode);
    if (rootNode && rootNode !== measureNode) {
      observer.observe(rootNode);
    }
    if (contentNode) {
      observer.observe(contentNode);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [
    contentElementRef,
    getObserveRoot,
    hasEntries,
    measureElementRef,
    measureScrollLayout,
    observeRoot,
    surface.kind,
  ]);

  useEffect(() => {
    measureScrollLayout();
  }, [entriesIdentityKey, enabled, hasNextPage, measureScrollLayout]);

  useEffect(() => {
    seenEntryIds.current.clear();
    markedReadIds.current.clear();
    pendingReadHeights.current.clear();
    session.current += 1;

    if (batchTimer.current) {
      clearTimeout(batchTimer.current);
      batchTimer.current = null;
    }
    if (graceTimer.current) {
      clearTimeout(graceTimer.current);
      graceTimer.current = null;
    }
  }, [resetKey]);

  useEffect(() => {
    seenEntryIds.current.clear();
    markedReadIds.current.clear();
    session.current += 1;
  }, [observeRoot]);

  useEffect(() => {
    return () => {
      if (batchTimer.current) {
        clearTimeout(batchTimer.current);
        batchTimer.current = null;
      }
      if (graceTimer.current) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    seenEntryIds.current.clear();
    graceUntil.current = Date.now() + MARK_READ_ON_SCROLL_GRACE_MS;
    if (graceTimer.current) {
      clearTimeout(graceTimer.current);
    }
    graceTimer.current = setTimeout(() => {
      graceTimer.current = null;
      setObserverVersion((version) => version + 1);
    }, MARK_READ_ON_SCROLL_GRACE_MS);

    return () => {
      if (graceTimer.current) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };
  }, [entriesIdentityKey, enabled]);

  const flushReadQueue = useCallback(
    function flushReadQueue() {
      if (batchTimer.current) {
        clearTimeout(batchTimer.current);
        batchTimer.current = null;
      }

      const pendingMap = pendingReadHeights.current;
      if (pendingMap.size === 0) return;

      const node = getObserveRoot();
      if (scrollCompensation === "anchor" && !node) {
        batchTimer.current = setTimeout(
          flushReadQueue,
          MARK_READ_ON_SCROLL_BATCH_DELAY_MS,
        );
        return;
      }

      const ids = Array.from(pendingMap.keys());
      const removedHeight = Array.from(pendingMap.values()).reduce(
        (sum, height) => sum + height,
        0,
      );
      pendingMap.clear();

      const idSet = new Set(ids);
      const anchor =
        scrollCompensation === "anchor" && node
          ? findVisibleAnchor(node, surface.getViewportRect(), idSet)
          : null;
      const currentSession = session.current;

      markManyAsRead(
        { ids, read: true, skipInvalidate: true },
        {
          onSuccess: () => {
            if (!unreadOnly || session.current !== currentSession) return;

            removeFromUnreadList(idSet);

            if (scrollCompensation === "anchor") {
              if (!anchor || !node) return;
              requestAnimationFrame(() => {
                if (
                  session.current !== currentSession ||
                  getObserveRoot() !== node
                ) {
                  return;
                }
                const nextAnchor = findEntryElement(node, anchor.id);
                if (!nextAnchor) return;
                surface.scrollBy(
                  nextAnchor.getBoundingClientRect().top - anchor.top,
                );
              });
            } else if (removedHeight > 0) {
              requestAnimationFrame(() => {
                if (session.current !== currentSession) return;
                surface.scrollBy(-removedHeight);
              });
            }
          },
          onError: () => {
            for (const id of ids) {
              markedReadIds.current.delete(id);
              seenEntryIds.current.delete(id);
            }
            setObserverVersion((version) => version + 1);
          },
        },
      );
    },
    [
      getObserveRoot,
      markManyAsRead,
      removeFromUnreadList,
      scrollCompensation,
      surface,
      unreadOnly,
    ],
  );

  const queueRead = useCallback(
    (entryId: string, removedHeight: number) => {
      if (!pendingReadHeights.current.has(entryId)) {
        pendingReadHeights.current.set(entryId, removedHeight);
      }
      if (batchTimer.current) return;

      const remainingGraceMs = Math.max(0, graceUntil.current - Date.now());
      batchTimer.current = setTimeout(
        flushReadQueue,
        remainingGraceMs + MARK_READ_ON_SCROLL_BATCH_DELAY_MS,
      );
    },
    [flushReadQueue],
  );

  useEffect(() => {
    const rootNode = getObserveRoot();
    if (
      !enabled ||
      !rootNode ||
      !hasUnreadEntries ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const viewport = surface.getViewportRect();
    const rootMargin =
      surface.kind === "document"
        ? `-${Math.ceil(viewport.top)}px 0px 0px 0px`
        : "0px";

    const observer = new IntersectionObserver(
      (items) => {
        for (const item of items) {
          const target = item.target as HTMLElement;
          const entryId = target.dataset.entryId;
          if (
            !entryId ||
            !unreadIdsRef.current.has(entryId) ||
            markedReadIds.current.has(entryId)
          ) {
            continue;
          }

          if (item.isIntersecting) {
            seenEntryIds.current.add(entryId);
            continue;
          }

          const rootTop = item.rootBounds?.top ?? surface.getViewportRect().top;
          if (
            !seenEntryIds.current.has(entryId) ||
            item.boundingClientRect.bottom > rootTop
          ) {
            continue;
          }

          markedReadIds.current.add(entryId);
          const removedHeight =
            scrollCompensation === "height"
              ? target.getBoundingClientRect().height ||
                target.offsetHeight ||
                0
              : 0;
          queueRead(entryId, removedHeight);
        }
      },
      {
        root: surface.getIntersectionRoot(),
        rootMargin,
        threshold: 0,
      },
    );

    const observedItems = new WeakMap<Element, string>();
    const observeEntryItems = () => {
      const visibleRect = surface.getViewportRect();
      for (const item of rootNode.querySelectorAll<HTMLElement>(
        "[data-entry-id]",
      )) {
        const entryId = item.dataset.entryId;
        if (
          !entryId ||
          !unreadIdsRef.current.has(entryId) ||
          markedReadIds.current.has(entryId)
        ) {
          continue;
        }
        if (observedItems.get(item) === entryId) continue;

        const itemRect = item.getBoundingClientRect();
        if (
          itemRect.bottom > visibleRect.top &&
          itemRect.top < visibleRect.bottom
        ) {
          seenEntryIds.current.add(entryId);
        }

        if (!observedItems.has(item)) {
          observer.observe(item);
        }
        observedItems.set(item, entryId);
      }
    };

    observeEntryItems();

    const mutationObserver =
      observeMutations && typeof MutationObserver !== "undefined"
        ? new MutationObserver(observeEntryItems)
        : null;
    mutationObserver?.observe(rootNode, {
      childList: true,
      subtree: true,
    });

    return () => {
      mutationObserver?.disconnect();
      observer.disconnect();
    };
  }, [
    enabled,
    entriesIdentityKey,
    getObserveRoot,
    hasUnreadEntries,
    observeMutations,
    observeRoot,
    observerVersion,
    queueRead,
    scrollCompensation,
    surface,
  ]);

  return { endPaddingHeight };
}

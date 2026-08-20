import { useMemo, type RefObject } from "react";

export interface ScrollViewportRect {
  top: number;
  bottom: number;
  height: number;
}

export interface ScrollSurface {
  readonly kind: "element" | "document";
  subscribe(listener: () => void): () => void;
  getScrollTop(): number;
  getScrollHeight(): number;
  getDistanceToBottom(): number;
  getViewportRect(): ScrollViewportRect;
  getIntersectionRoot(): HTMLElement | null;
  scrollTo(top: number, behavior?: ScrollBehavior): void;
  scrollBy(deltaY: number): void;
}

interface UseEntryListScrollSurfaceOptions {
  documentScroll: boolean;
  containerRef: RefObject<HTMLElement | null>;
  headerRef: RefObject<HTMLDivElement | null>;
}

export function useEntryListScrollSurface({
  documentScroll,
  containerRef,
  headerRef,
}: UseEntryListScrollSurfaceOptions): ScrollSurface {
  return useMemo<ScrollSurface>(() => {
    if (!documentScroll) {
      const getNode = () => containerRef.current;

      return {
        kind: "element",
        subscribe(listener) {
          const node = getNode();
          if (!node) return () => undefined;
          node.addEventListener("scroll", listener, { passive: true });
          return () => node.removeEventListener("scroll", listener);
        },
        getScrollTop() {
          return getNode()?.scrollTop ?? 0;
        },
        getScrollHeight() {
          return getNode()?.scrollHeight ?? 0;
        },
        getDistanceToBottom() {
          const node = getNode();
          if (!node) return Number.POSITIVE_INFINITY;
          return node.scrollHeight - node.scrollTop - node.clientHeight;
        },
        getViewportRect() {
          const node = getNode();
          if (!node) return { top: 0, bottom: 0, height: 0 };
          const rect = node.getBoundingClientRect();
          const height = node.clientHeight || rect.height;
          return { top: rect.top, bottom: rect.top + height, height };
        },
        getIntersectionRoot() {
          return getNode();
        },
        scrollTo(top, behavior = "auto") {
          const node = getNode();
          if (!node) return;
          if (typeof node.scrollTo === "function") {
            node.scrollTo({ top, behavior });
            return;
          }
          node.scrollTop = top;
        },
        scrollBy(deltaY) {
          const node = getNode();
          if (!node) return;
          node.scrollTop = Math.max(0, node.scrollTop + deltaY);
        },
      };
    }

    const getViewportHeight = () =>
      document.documentElement.clientHeight || window.innerHeight;
    const getScrollTop = () =>
      window.scrollY || document.documentElement.scrollTop;
    const getScrollHeight = () =>
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );

    return {
      kind: "document",
      subscribe(listener) {
        window.addEventListener("scroll", listener, { passive: true });
        return () => window.removeEventListener("scroll", listener);
      },
      getScrollTop,
      getScrollHeight,
      getDistanceToBottom() {
        return getScrollHeight() - getScrollTop() - getViewportHeight();
      },
      getViewportRect() {
        const top = Math.max(
          0,
          headerRef.current?.getBoundingClientRect().bottom ?? 0,
        );
        const bottom = getViewportHeight();
        return { top, bottom, height: Math.max(0, bottom - top) };
      },
      getIntersectionRoot() {
        return null;
      },
      scrollTo(top, behavior = "auto") {
        window.scrollTo({ top, behavior });
      },
      scrollBy(deltaY) {
        window.scrollTo({
          top: Math.max(0, getScrollTop() + deltaY),
          behavior: "auto",
        });
      },
    };
  }, [containerRef, documentScroll, headerRef]);
}

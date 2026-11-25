import { useCallback, useLayoutEffect, useRef, useState } from "react";

const SCROLL_TOP_THRESHOLD = 48;

// Module-level cache: entryId -> scrollTop
const entryScrollPositions = new Map<string, number>();

export function clearEntryScrollPositions(): void {
  entryScrollPositions.clear();
}

export function useEntryContentScroll(entryId: string | null) {
  const scrollNodeRef = useRef<HTMLDivElement | null>(null);
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState<{
    entryId: string | null;
    isAtTop: boolean;
  } | null>(null);

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollNodeRef.current = node;
    setScrollNode(node);
  }, []);

  useLayoutEffect(() => {
    const node = scrollNodeRef.current;
    if (!node) return;

    const handleScroll = () => {
      const top = node.scrollTop;
      const atTop = top < SCROLL_TOP_THRESHOLD;
      setScrollState({ entryId, isAtTop: atTop });
      if (entryId) {
        entryScrollPositions.set(entryId, top);
      }
    };

    const saved = entryId ? entryScrollPositions.get(entryId) : undefined;
    node.scrollTop = saved ?? 0;

    node.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      node.removeEventListener("scroll", handleScroll);
    };
  }, [entryId, scrollNode]);

  const savedScrollTop = entryId ? (entryScrollPositions.get(entryId) ?? 0) : 0;
  const effectiveIsAtTop =
    scrollState !== null && scrollState.entryId === entryId
      ? scrollState.isAtTop
      : savedScrollTop < SCROLL_TOP_THRESHOLD;

  return { scrollRef, isAtTop: effectiveIsAtTop, scrollNode };
}

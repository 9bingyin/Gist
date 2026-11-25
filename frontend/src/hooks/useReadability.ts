import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchReadableContent } from "@/api";
import type { Entry } from "@/types/api";

interface UseReadabilityOptions {
  entry: Entry | undefined;
  autoReadability: boolean;
}

interface UseReadabilityReturn {
  isReadableLoading: boolean;
  readableContent: string | null | undefined;
  showReadable: boolean;
  readableError: string | null;
  isReadableActive: boolean;
  baseContent: string | null | undefined;
  handleToggleReadable: () => Promise<void>;
}

export function useReadability({
  entry,
  autoReadability,
}: UseReadabilityOptions): UseReadabilityReturn {
  const queryClient = useQueryClient();
  const [isReadableLoading, setIsReadableLoading] = useState(false);
  const [localReadableContent, setLocalReadableContent] = useState<
    string | null
  >(null);
  const [showReadable, setShowReadable] = useState(false);
  const [readableError, setReadableError] = useState<string | null>(null);

  const activeEntryIdRef = useRef<string | undefined>(entry?.id);
  const abortControllerRef = useRef<AbortController | null>(null);
  const attemptedEntryIdRef = useRef<string | null>(null);
  const manuallyDisabledRef = useRef(false);

  useEffect(() => {
    activeEntryIdRef.current = entry?.id;
  }, [entry?.id]);

  // Reset state and cancel in-flight fetch when entry changes or unmounts
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    attemptedEntryIdRef.current = null;
    manuallyDisabledRef.current = false;
    setLocalReadableContent(null);
    setShowReadable(false);
    setReadableError(null);
    setIsReadableLoading(false);

    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [entry?.id]);

  const readableContent = localReadableContent || entry?.readableContent;
  const hasReadableContent = !!readableContent;
  const isReadableActive = hasReadableContent && showReadable;
  const baseContent = isReadableActive ? readableContent : entry?.content;

  const loadReadableContent = useCallback(
    async (targetEntryId: string) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsReadableLoading(true);
      setReadableError(null);

      try {
        const content = await fetchReadableContent(
          targetEntryId,
          controller.signal,
        );
        if (
          controller.signal.aborted ||
          activeEntryIdRef.current !== targetEntryId
        ) {
          return;
        }
        setLocalReadableContent(content);
        setShowReadable(true);
        queryClient.setQueryData<Entry>(["entry", targetEntryId], (old) =>
          old ? { ...old, readableContent: content } : old,
        );
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === "AbortError") ||
          activeEntryIdRef.current !== targetEntryId
        ) {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : "Failed to fetch readable content";
        setReadableError(message);
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          setIsReadableLoading(false);
        }
      }
    },
    [queryClient],
  );

  const handleToggleReadable = useCallback(async () => {
    if (!entry) return;

    if (hasReadableContent) {
      setShowReadable((prev) => {
        const next = !prev;
        manuallyDisabledRef.current = !next;
        return next;
      });
      return;
    }

    if (!entry.url || isReadableLoading) return;
    manuallyDisabledRef.current = false;
    attemptedEntryIdRef.current = entry.id;
    await loadReadableContent(entry.id);
  }, [entry, hasReadableContent, isReadableLoading, loadReadableContent]);

  // Auto-enable readability once per entry when enabled
  useEffect(() => {
    if (!autoReadability || !entry) return;
    if (manuallyDisabledRef.current) return;
    if (attemptedEntryIdRef.current === entry.id) return;

    if (entry.readableContent) {
      attemptedEntryIdRef.current = entry.id;
      setShowReadable(true);
      return;
    }

    if (entry.url) {
      attemptedEntryIdRef.current = entry.id;
      void loadReadableContent(entry.id);
    }
  }, [
    autoReadability,
    entry,
    entry?.id,
    entry?.readableContent,
    entry?.url,
    loadReadableContent,
  ]);

  return {
    isReadableLoading,
    readableContent,
    showReadable,
    readableError,
    isReadableActive,
    baseContent,
    handleToggleReadable,
  };
}

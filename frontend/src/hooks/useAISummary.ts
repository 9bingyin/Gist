import { useState, useCallback, useEffect, useRef } from "react";
import { streamSummary } from "@/api";
import type { Entry } from "@/types/api";

interface UseAISummaryOptions {
  entry: Entry | undefined;
  isReadableActive: boolean;
  readableContent: string | null | undefined;
  autoSummary: boolean;
}

interface UseAISummaryReturn {
  aiSummary: string | null;
  isLoadingSummary: boolean;
  summaryError: string | null;
  handleToggleSummary: () => Promise<void>;
}

export function useAISummary({
  entry,
  isReadableActive,
  readableContent,
  autoSummary,
}: UseAISummaryOptions): UseAISummaryReturn {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const summaryAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const summaryRequestedRef = useRef(false);
  const prevReadableActiveRef = useRef(false);
  const summaryManuallyDisabledRef = useRef(false);

  // Reset state and cancel in-flight SSE when entry changes or unmounts
  useEffect(() => {
    requestSeqRef.current += 1;
    summaryAbortRef.current?.abort();
    summaryAbortRef.current = null;
    setAiSummary(null);
    setSummaryError(null);
    setIsLoadingSummary(false);
    summaryRequestedRef.current = false;
    prevReadableActiveRef.current = false;
    summaryManuallyDisabledRef.current = false;

    return () => {
      requestSeqRef.current += 1;
      summaryAbortRef.current?.abort();
      summaryAbortRef.current = null;
    };
  }, [entry?.id]);

  const generateSummary = useCallback(
    async (forReadability: boolean) => {
      if (!entry) return;

      requestSeqRef.current += 1;
      const requestSeq = requestSeqRef.current;

      summaryAbortRef.current?.abort();
      summaryAbortRef.current = null;

      const content = forReadability ? readableContent : entry.content;
      if (!content) {
        setSummaryError("No content to summarize");
        return;
      }

      setIsLoadingSummary(true);
      setSummaryError(null);
      setAiSummary(null);
      summaryRequestedRef.current = true;

      const abortController = new AbortController();
      summaryAbortRef.current = abortController;

      try {
        const stream = streamSummary(
          {
            entryId: entry.id,
            content,
            title: entry.title ?? undefined,
            isReadability: forReadability,
          },
          abortController.signal,
        );

        for await (const chunk of stream) {
          if (requestSeqRef.current !== requestSeq) {
            return;
          }
          if (typeof chunk === "object" && "cached" in chunk) {
            setAiSummary(chunk.summary);
          } else {
            setAiSummary((prev) => (prev ?? "") + chunk);
          }
        }
      } catch (err) {
        if (requestSeqRef.current !== requestSeq) {
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setAiSummary(null);
        const message =
          err instanceof Error ? err.message : "Failed to generate summary";
        setSummaryError(message);
      } finally {
        if (requestSeqRef.current === requestSeq) {
          setIsLoadingSummary(false);
          if (summaryAbortRef.current === abortController) {
            summaryAbortRef.current = null;
          }
        }
      }
    },
    [entry, readableContent],
  );

  const handleToggleSummary = useCallback(async () => {
    if (!entry) return;

    if (aiSummary && !isLoadingSummary) {
      setAiSummary(null);
      summaryRequestedRef.current = false;
      summaryManuallyDisabledRef.current = true;
      return;
    }

    if (isLoadingSummary && summaryAbortRef.current) {
      requestSeqRef.current += 1;
      summaryAbortRef.current.abort();
      summaryAbortRef.current = null;
      setIsLoadingSummary(false);
      summaryRequestedRef.current = false;
      summaryManuallyDisabledRef.current = true;
      return;
    }

    summaryManuallyDisabledRef.current = false;
    await generateSummary(isReadableActive);
  }, [entry, aiSummary, isLoadingSummary, isReadableActive, generateSummary]);

  // Auto-regenerate when readability mode changes
  useEffect(() => {
    if (prevReadableActiveRef.current !== isReadableActive) {
      prevReadableActiveRef.current = isReadableActive;
      if (summaryRequestedRef.current && (aiSummary || isLoadingSummary)) {
        void generateSummary(isReadableActive);
      }
    }
  }, [isReadableActive, aiSummary, isLoadingSummary, generateSummary]);

  // Auto-generate when entry is selected
  useEffect(() => {
    if (!autoSummary || !entry || isLoadingSummary) return;
    if (summaryManuallyDisabledRef.current) return;
    if (aiSummary || summaryRequestedRef.current) return;

    void generateSummary(isReadableActive);
  }, [
    autoSummary,
    entry,
    isReadableActive,
    isLoadingSummary,
    aiSummary,
    generateSummary,
  ]);

  return {
    aiSummary,
    isLoadingSummary,
    summaryError,
    handleToggleSummary,
  };
}

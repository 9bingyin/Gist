import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  streamTranslateBlocks,
  isTranslateInit,
  isTranslateBlockResult,
  type TranslateBlockData,
} from "@/api";
import { needsTranslation } from "@/lib/language-detect-async";
import { stripHtml } from "@/lib/html-utils";
import {
  useTranslationStore,
  translationActions,
} from "@/stores/translation-store";
import { translateArticlesBatch } from "@/services/translation-service";
import type { Entry } from "@/types/api";

interface UseAITranslationOptions {
  entry: Entry | undefined;
  isReadableActive: boolean;
  readableContent: string | null | undefined;
  autoTranslate: boolean;
  targetLanguage: string;
}

interface UseAITranslationReturn {
  isTranslating: boolean;
  hasTranslation: boolean;
  translationDisabled: boolean;
  displayTitle: string | null;
  translatedContent: string | null;
  translatedContentBlocks: Array<{ key: string; html: string }> | null;
  combinedTranslatedContent: string | null;
  handleToggleTranslation: () => Promise<void>;
}

interface TranslationLocalState {
  translatedContent: string | null;
  originalBlocks: TranslateBlockData[];
  translatedBlocks: Map<number, string>;
  isTranslating: boolean;
  translationMode: boolean | null;
}

type TranslationAction =
  | { type: "reset" }
  | { type: "start"; mode: boolean }
  | { type: "cached"; content: string; mode: boolean }
  | { type: "init"; blocks: TranslateBlockData[] }
  | { type: "block"; index: number; html: string }
  | { type: "finish" }
  | { type: "cancel" };

const initialTranslationState: TranslationLocalState = {
  translatedContent: null,
  originalBlocks: [],
  translatedBlocks: new Map(),
  isTranslating: false,
  translationMode: null,
};

function translationReducer(
  state: TranslationLocalState,
  action: TranslationAction,
): TranslationLocalState {
  switch (action.type) {
    case "reset":
      return initialTranslationState;
    case "start":
      return {
        translatedContent: null,
        originalBlocks: [],
        translatedBlocks: new Map(),
        isTranslating: true,
        translationMode: action.mode,
      };
    case "cached":
      return {
        translatedContent: action.content,
        originalBlocks: [],
        translatedBlocks: new Map(),
        isTranslating: false,
        translationMode: action.mode,
      };
    case "init":
      return {
        ...state,
        originalBlocks: action.blocks,
      };
    case "block": {
      const nextMap = new Map(state.translatedBlocks);
      nextMap.set(action.index, action.html);
      return {
        ...state,
        translatedBlocks: nextMap,
      };
    }
    case "finish":
      return {
        ...state,
        isTranslating: false,
      };
    case "cancel":
      return {
        ...state,
        isTranslating: false,
      };
  }
}

export function useAITranslation({
  entry,
  isReadableActive,
  readableContent,
  autoTranslate,
  targetLanguage,
}: UseAITranslationOptions): UseAITranslationReturn {
  const [state, dispatch] = useReducer(
    translationReducer,
    initialTranslationState,
  );

  const translateAbortRef = useRef<AbortController | null>(null);
  const titleAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const manuallyDisabledRef = useRef(false);
  const translateRequestedRef = useRef(false);
  const prevReadableRef = useRef(isReadableActive);

  const currentContent = isReadableActive ? readableContent : entry?.content;
  const currentSummary = useMemo(
    () => (currentContent ? stripHtml(currentContent).slice(0, 200) : null),
    [currentContent],
  );

  // Single deduplicated async language detection for the active content mode
  const detectionKey = entry
    ? `${entry.id}|${isReadableActive}|${targetLanguage}|${entry.title ?? ""}|${currentSummary ?? ""}`
    : "";
  const [detection, setDetection] = useState<{
    key: string;
    needs: boolean;
  } | null>(null);

  useEffect(() => {
    if (!entry || !detectionKey) return;
    let cancelled = false;
    void needsTranslation(entry.title || "", currentSummary, targetLanguage)
      .then((needs) => {
        if (!cancelled) {
          setDetection({ key: detectionKey, needs });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetection({ key: detectionKey, needs: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry, detectionKey, currentSummary, targetLanguage]);

  const isDetectionReady = !!entry && detection?.key === detectionKey;
  const needsCurrentTranslation = isDetectionReady ? detection.needs : false;
  const isAlreadyTargetLanguage = isDetectionReady ? !detection.needs : false;

  const cancelInFlightTranslation = useCallback(() => {
    requestSeqRef.current += 1;
    translateAbortRef.current?.abort();
    translateAbortRef.current = null;
    dispatch({ type: "cancel" });
  }, []);

  // Reset state and abort all streams on entry change or unmount
  useEffect(() => {
    requestSeqRef.current += 1;
    translateAbortRef.current?.abort();
    translateAbortRef.current = null;
    titleAbortRef.current?.abort();
    titleAbortRef.current = null;
    translateRequestedRef.current = false;
    prevReadableRef.current = false;
    manuallyDisabledRef.current = false;
    dispatch({ type: "reset" });

    return () => {
      requestSeqRef.current += 1;
      translateAbortRef.current?.abort();
      translateAbortRef.current = null;
      titleAbortRef.current?.abort();
      titleAbortRef.current = null;
    };
  }, [entry?.id]);

  // Get cached translations from store
  const cachedTranslation = useTranslationStore((store) =>
    entry && autoTranslate
      ? store.getTranslation(entry.id, targetLanguage, isReadableActive)
      : undefined,
  );

  const cachedTitleTranslation = useTranslationStore((store) =>
    entry && autoTranslate
      ? store.getTranslation(entry.id, targetLanguage)
      : undefined,
  );

  const isTranslationForCurrentMode =
    state.translationMode === isReadableActive;
  const translatedContentForCurrentMode = isTranslationForCurrentMode
    ? state.translatedContent
    : null;

  const displayTitle = useMemo(() => {
    if (!autoTranslate || !entry) return entry?.title || null;
    return cachedTitleTranslation?.title ?? entry.title ?? null;
  }, [autoTranslate, entry, cachedTitleTranslation?.title]);

  const combinedTranslatedContent = useMemo(() => {
    if (!isTranslationForCurrentMode) return null;
    if (translatedContentForCurrentMode) return translatedContentForCurrentMode;
    if (state.originalBlocks.length === 0) return null;
    return state.originalBlocks
      .map((block) => state.translatedBlocks.get(block.index) ?? block.html)
      .join("");
  }, [
    isTranslationForCurrentMode,
    translatedContentForCurrentMode,
    state.originalBlocks,
    state.translatedBlocks,
  ]);

  const translatedContentBlocks = useMemo(() => {
    if (
      !entry ||
      !isTranslationForCurrentMode ||
      translatedContentForCurrentMode ||
      state.originalBlocks.length === 0
    ) {
      return null;
    }
    return state.originalBlocks.map((block) => ({
      key: `${entry.id}-${block.index}`,
      html: state.translatedBlocks.get(block.index) ?? block.html,
    }));
  }, [
    entry,
    isTranslationForCurrentMode,
    translatedContentForCurrentMode,
    state.originalBlocks,
    state.translatedBlocks,
  ]);

  const hasTranslation =
    !state.isTranslating &&
    isTranslationForCurrentMode &&
    !!(translatedContentForCurrentMode || state.originalBlocks.length > 0);

  const generateTranslation = useCallback(
    async (forReadability: boolean) => {
      if (!entry) return;

      const content = forReadability ? readableContent : entry.content;
      if (!content) return;

      requestSeqRef.current += 1;
      const requestSeq = requestSeqRef.current;

      translateAbortRef.current?.abort();
      const abortController = new AbortController();
      translateAbortRef.current = abortController;

      translateRequestedRef.current = true;
      dispatch({ type: "start", mode: forReadability });

      let finalCachedContent: string | null = null;
      let blocksSnapshot: TranslateBlockData[] = [];
      const translatedMap = new Map<number, string>();

      try {
        const stream = streamTranslateBlocks(
          {
            entryId: entry.id,
            content,
            title: entry.title ?? undefined,
            isReadability: forReadability,
          },
          abortController.signal,
        );

        for await (const event of stream) {
          if (requestSeqRef.current !== requestSeq) {
            return;
          }

          if ("cached" in event) {
            finalCachedContent = event.content;
            dispatch({
              type: "cached",
              content: event.content,
              mode: forReadability,
            });
            break;
          }

          if (isTranslateInit(event)) {
            blocksSnapshot = event.blocks;
            dispatch({ type: "init", blocks: event.blocks });
            continue;
          }

          if (isTranslateBlockResult(event)) {
            translatedMap.set(event.index, event.html);
            dispatch({ type: "block", index: event.index, html: event.html });
          }
        }

        if (requestSeqRef.current === requestSeq && autoTranslate) {
          const finalContent =
            finalCachedContent ??
            (blocksSnapshot.length > 0
              ? blocksSnapshot
                  .map((b) => translatedMap.get(b.index) ?? b.html)
                  .join("")
              : null);
          if (finalContent) {
            translationActions.set(
              entry.id,
              targetLanguage,
              { content: finalContent },
              forReadability,
            );
          }
        }
      } catch (err) {
        if (requestSeqRef.current !== requestSeq) {
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
      } finally {
        if (requestSeqRef.current === requestSeq) {
          dispatch({ type: "finish" });
          if (translateAbortRef.current === abortController) {
            translateAbortRef.current = null;
          }
        }
      }
    },
    [entry, readableContent, autoTranslate, targetLanguage],
  );

  const handleToggleTranslation = useCallback(async () => {
    if (!entry) return;

    if (hasTranslation && !state.isTranslating) {
      dispatch({ type: "reset" });
      translateRequestedRef.current = false;
      manuallyDisabledRef.current = true;
      translationActions.disable(entry.id);
      return;
    }

    if (state.isTranslating && translateAbortRef.current) {
      cancelInFlightTranslation();
      dispatch({ type: "reset" });
      translateRequestedRef.current = false;
      manuallyDisabledRef.current = true;
      translationActions.disable(entry.id);
      return;
    }

    manuallyDisabledRef.current = false;
    translationActions.enable(entry.id);

    if (needsCurrentTranslation) {
      titleAbortRef.current?.abort();
      const titleController = new AbortController();
      titleAbortRef.current = titleController;
      translateArticlesBatch(
        [{ id: entry.id, title: entry.title || "", summary: currentSummary }],
        targetLanguage,
        titleController.signal,
      ).catch(() => {});
    }

    await generateTranslation(isReadableActive);
  }, [
    entry,
    hasTranslation,
    state.isTranslating,
    isReadableActive,
    needsCurrentTranslation,
    currentSummary,
    cancelInFlightTranslation,
    generateTranslation,
    targetLanguage,
  ]);

  // Unified effect for readability mode switches & auto-translation
  useEffect(() => {
    if (!entry) return;

    const readabilityChanged = prevReadableRef.current !== isReadableActive;

    // Immediately cancel stale mode translation if readability switched
    if (readabilityChanged && state.translationMode !== isReadableActive) {
      if (state.isTranslating) {
        cancelInFlightTranslation();
      }
    }

    if (!isDetectionReady) return;

    if (readabilityChanged) {
      prevReadableRef.current = isReadableActive;

      if (translateRequestedRef.current) {
        if (cachedTranslation?.content) {
          cancelInFlightTranslation();
          dispatch({
            type: "cached",
            content: cachedTranslation.content,
            mode: isReadableActive,
          });
          return;
        }

        if (needsCurrentTranslation) {
          void generateTranslation(isReadableActive);
          return;
        }

        cancelInFlightTranslation();
        dispatch({ type: "reset" });
        translateRequestedRef.current = false;
        return;
      }
    }

    // Auto-translate when enabled and not already translated/translating/disabled
    if (!autoTranslate || manuallyDisabledRef.current) return;
    if (translateRequestedRef.current) return;
    if (state.isTranslating && isTranslationForCurrentMode) return;
    if (hasTranslation) return;

    if (cachedTranslation?.content) {
      translateRequestedRef.current = true;
      dispatch({
        type: "cached",
        content: cachedTranslation.content,
        mode: isReadableActive,
      });
      return;
    }

    if (needsCurrentTranslation) {
      void generateTranslation(isReadableActive);
    }
  }, [
    entry,
    isReadableActive,
    isDetectionReady,
    needsCurrentTranslation,
    autoTranslate,
    cachedTranslation,
    state.isTranslating,
    state.translationMode,
    isTranslationForCurrentMode,
    hasTranslation,
    cancelInFlightTranslation,
    generateTranslation,
  ]);

  return {
    isTranslating: state.isTranslating,
    hasTranslation,
    translationDisabled: isAlreadyTargetLanguage,
    displayTitle,
    translatedContent: translatedContentForCurrentMode,
    translatedContentBlocks,
    combinedTranslatedContent,
    handleToggleTranslation,
  };
}

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ArticleContent } from "@/components/ui/article-content";
import {
  ExternalLinkIcon,
  RssIcon,
  ClockIcon,
  BookOpenIcon,
  LoaderIcon,
  SparklesIcon,
  LanguagesIcon,
  ArrowLeftIcon,
  AlertCircleIcon,
  StarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { needsTranslation } from "@/lib/language-detect";
import { useTranslation } from "react-i18next";
import { useArticleTranslation } from "@/hooks/use-article-translation";
import { translateArticle } from "@/lib/services/translation-service";
import type { Article } from "@/lib/types";

interface ArticleDetailProps {
  article: Article | null;
  onArticleUpdate?: (article: Article) => void;
  onToggleStar?: (article: Article) => void;
  autoTranslate?: boolean;
  targetLanguage?: string;
  aiEnabled?: boolean;
  alwaysReadability?: boolean;
  alwaysSummary?: boolean;
  onBack?: () => void;
}

function AiSummaryBox({ content }: { content: string | null }) {
  if (!content) return null;

  return (
    <div className="ai-summary-box mt-6 rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
      <div className="ai-summary-grid">
        <div className="ai-summary-content">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <SparklesIcon className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-primary">AI 概括</h3>
            </div>
            <div className="text-sm leading-relaxed text-foreground space-y-2">
              {content
                .split("\n")
                .filter((line) => line.trim())
                .map((point, index) => (
                  <p key={index}>{point.trim()}</p>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArticleDetail({
  article,
  onArticleUpdate,
  onToggleStar,
  autoTranslate,
  targetLanguage,
  aiEnabled = true,
  alwaysReadability = false,
  alwaysSummary = false,
  onBack,
}: ArticleDetailProps) {
  const { t, i18n } = useTranslation();

  function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return t("time.unknown");
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return t("time.unknown");
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Handle future dates
    if (diffMs < 0) {
      const absDiffMs = Math.abs(diffMs);
      const diffMinutes = Math.floor(absDiffMs / 60000);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMinutes < 60)
        return t("time.in_minutes", { count: diffMinutes || 1 });
      if (diffHours < 24) return t("time.in_hours", { count: diffHours });
      if (diffDays < 7) return t("time.in_days", { count: diffDays });
      return date.toLocaleDateString(
        i18n.language === "zh" ? "zh-CN" : "en-US",
        { year: "numeric", month: "long", day: "numeric" }
      );
    }

    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return t("time.just_now");
    if (diffMinutes < 60) return t("time.minutes_ago", { count: diffMinutes });
    if (diffHours < 24) return t("time.hours_ago", { count: diffHours });
    if (diffDays < 7) return t("time.days_ago", { count: diffDays });

    return date.toLocaleDateString(i18n.language === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const [isLoadingReadability, setIsLoadingReadability] = useState(false);
  const [useReadability, setUseReadability] = useState(false);
  const [readabilityError, setReadabilityError] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [translateEnabled, setTranslateEnabled] = useState(false);

  // AbortController refs for cancellation
  const summaryAbortRef = useRef<AbortController | null>(null);
  const translationAbortRef = useRef<AbortController | null>(null);
  // Track last article ID for auto-summary to avoid duplicate requests
  const lastAutoSummaryArticleIdRef = useRef<string | null>(null);
  // Track if we need to regenerate summary after readability content loads
  const pendingReadabilitySummaryRef = useRef(false);

  // Determine if we're actually using readability content
  const isActuallyReadability = useReadability && !!article?.readabilityContent;

  // Get translation from global store
  const translation = useArticleTranslation({
    articleId: article?.id ?? "",
    language: targetLanguage ?? "en",
    enabled: translateEnabled && !!article && !article.translationDisabled,
    isReadability: isActuallyReadability,
  });

  // Determine display content
  const displayTitle = translateEnabled && translation?.title
    ? translation.title
    : article?.title ?? "";
  const displayContent = translateEnabled && translation?.content
    ? translation.content
    : useReadability && article?.readabilityContent
      ? article.readabilityContent
      : article?.content ?? "";

  // Reset state when article changes
  useEffect(() => {
    summaryAbortRef.current?.abort();
    translationAbortRef.current?.abort();

    setUseReadability(alwaysReadability);
    setReadabilityError(null);
    setIsLoadingSummary(false);
    setAiSummary(null);
    setSummaryError(null);
    setIsLoadingTranslation(false);
    setTranslateEnabled(false);
    setTranslationError(null);
    // Reset tracking refs for new article
    lastAutoSummaryArticleIdRef.current = null;
    pendingReadabilitySummaryRef.current = false;
  }, [article?.id, alwaysReadability]);

  // Auto-translate when article changes and autoTranslate is enabled
  useEffect(() => {
    if (!autoTranslate || !article || !targetLanguage) return;

    // Skip if user manually disabled translation for this article
    if (article.translationDisabled) return;

    // Skip if article is already in target language
    if (!needsTranslation(article.title, article.summary, targetLanguage))
      return;

    // Enable translation mode
    setTranslateEnabled(true);
  }, [article?.id, autoTranslate, targetLanguage, article?.translationDisabled]);

  // Perform translation when translateEnabled changes
  useEffect(() => {
    if (!translateEnabled || !article || !targetLanguage) return;

    // If useReadability is enabled but readabilityContent not loaded yet, wait
    if (useReadability && !article.readabilityContent) return;

    // Skip if already have translation in store
    if (translation?.content) {
      setIsLoadingTranslation(false);
      return;
    }

    // Skip if article is in target language
    if (!needsTranslation(article.title, article.summary, targetLanguage)) {
      setTranslateEnabled(false);
      return;
    }

    // Abort previous and create new controller
    translationAbortRef.current?.abort();
    const abortController = new AbortController();
    translationAbortRef.current = abortController;

    const performTranslation = async () => {
      setIsLoadingTranslation(true);
      setTranslationError(null);

      try {
        const isReadability = useReadability && !!article.readabilityContent;
        const content = isReadability
          ? article.readabilityContent!
          : article.content || article.summary || "";

        await translateArticle(
          {
            articleId: article.id,
            title: article.title,
            summary: article.summary,
            content,
            isReadability,
          },
          abortController.signal
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Translation failed";
        if (!abortController.signal.aborted) {
          setTranslationError(message);
        }
        console.error("Translation error:", error);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingTranslation(false);
        }
      }
    };

    performTranslation();

    return () => {
      abortController.abort();
    };
  }, [translateEnabled, useReadability, article?.id, targetLanguage, translation?.content, article?.readabilityContent]);

  // Regenerate summary when readability mode changes
  useEffect(() => {
    if (!article) return;

    // Check if we had a summary or were loading one (before any state changes)
    const hadSummary = aiSummary !== null || isLoadingSummary;

    // If no summary was ever requested, nothing to do
    if (!hadSummary && !pendingReadabilitySummaryRef.current) return;

    // Always abort current request first when mode changes
    summaryAbortRef.current?.abort();

    // If readability mode is enabled but content not loaded yet, wait for it
    if (useReadability && !article.readabilityContent) {
      pendingReadabilitySummaryRef.current = true;
      setIsLoadingSummary(false);
      setAiSummary(null);
      return;
    }

    // Clear pending flag
    pendingReadabilitySummaryRef.current = false;

    const abortController = new AbortController();
    summaryAbortRef.current = abortController;

    const regenerateSummary = async () => {
      setIsLoadingSummary(true);
      setSummaryError(null);
      setAiSummary("");
      try {
        const isReadability = useReadability && !!article.readabilityContent;
        const content = isReadability
          ? article.readabilityContent
          : article.content || article.summary;

        if (!content) {
          throw new Error("No content available");
        }

        const res = await fetch("/api/ai/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: article.id,
            content,
            title: article.title,
            isReadability,
          }),
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) return;

        if (!res.ok) {
          let errorMessage = `Summary failed (${res.status})`;
          try {
            const data = await res.json();
            errorMessage = data.error || errorMessage;
          } catch {
            // Ignore
          }
          throw new Error(errorMessage);
        }

        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const data = await res.json();
          if (abortController.signal.aborted) return;
          setAiSummary(data.summary);
        } else {
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let fullText = "";

          while (true) {
            if (abortController.signal.aborted) {
              reader.cancel();
              return;
            }
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
            if (!abortController.signal.aborted) {
              setAiSummary(fullText);
            }
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        const message =
          error instanceof Error ? error.message : "Summary failed";
        setSummaryError(message);
        setAiSummary(null);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingSummary(false);
        }
      }
    };

    regenerateSummary();

    return () => {
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useReadability, article?.readabilityContent]);

  const handleToggleReadability = useCallback(async () => {
    if (!article || isLoadingReadability) return;

    // Reset translation state when switching content mode
    setTranslationError(null);

    if (useReadability) {
      setUseReadability(false);
      return;
    }

    if (article.readabilityContent) {
      setUseReadability(true);
      return;
    }

    setIsLoadingReadability(true);
    setReadabilityError(null);
    try {
      const res = await fetch(`/api/articles/${article.id}/readability`, {
        method: "POST",
      });

      if (!res.ok) {
        let errorMessage = `Readability failed (${res.status})`;
        try {
          const data = await res.json();
          errorMessage = data.error || errorMessage;
        } catch {
          // Ignore
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      if (data.content && onArticleUpdate) {
        onArticleUpdate({
          ...article,
          readabilityContent: data.content,
        });
        setUseReadability(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed";
      setReadabilityError(message);
    } finally {
      setIsLoadingReadability(false);
    }
  }, [article, isLoadingReadability, useReadability, onArticleUpdate]);

  // Auto-fetch readability content when alwaysReadability is enabled
  useEffect(() => {
    if (!alwaysReadability || !article || article.readabilityContent) return;
    if (isLoadingReadability) return;

    const fetchReadability = async () => {
      setIsLoadingReadability(true);
      setReadabilityError(null);
      try {
        const res = await fetch(`/api/articles/${article.id}/readability`, {
          method: "POST",
        });

        if (!res.ok) {
          let errorMessage = `Readability failed (${res.status})`;
          try {
            const data = await res.json();
            errorMessage = data.error || errorMessage;
          } catch {
            // Ignore
          }
          throw new Error(errorMessage);
        }

        const data = await res.json();
        if (data.content && onArticleUpdate) {
          onArticleUpdate({
            ...article,
            readabilityContent: data.content,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed";
        setReadabilityError(message);
      } finally {
        setIsLoadingReadability(false);
      }
    };

    fetchReadability();
  }, [alwaysReadability, article?.id, article?.readabilityContent, onArticleUpdate]);

  const handleGenerateSummary = useCallback(async () => {
    if (!article) return;

    if (isLoadingSummary) {
      summaryAbortRef.current?.abort();
      setIsLoadingSummary(false);
      setAiSummary(null);
      return;
    }

    if (aiSummary) {
      setAiSummary(null);
      return;
    }

    const abortController = new AbortController();
    summaryAbortRef.current = abortController;

    setIsLoadingSummary(true);
    setSummaryError(null);
    setAiSummary("");
    try {
      const isReadability = useReadability && !!article.readabilityContent;
      const content = isReadability
        ? article.readabilityContent
        : article.content || article.summary;

      if (!content) {
        throw new Error("No content available");
      }

      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: article.id,
          content,
          title: article.title,
          isReadability,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        let errorMessage = `Summary failed (${res.status})`;
        try {
          const data = await res.json();
          errorMessage = data.error || errorMessage;
        } catch {
          // Ignore
        }
        throw new Error(errorMessage);
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await res.json();
        setAiSummary(data.summary);
      } else {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          if (abortController.signal.aborted) {
            reader.cancel();
            return;
          }
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setAiSummary(fullText);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Summary failed";
      setSummaryError(message);
      setAiSummary(null);
    } finally {
      if (!summaryAbortRef.current?.signal.aborted) {
        setIsLoadingSummary(false);
      }
    }
  }, [article, isLoadingSummary, aiSummary, useReadability]);

  // Auto-generate summary when alwaysSummary is enabled
  useEffect(() => {
    if (!alwaysSummary || !aiEnabled || !article) return;
    // Skip if already requested for this article
    if (lastAutoSummaryArticleIdRef.current === article.id) return;

    // If useReadability is enabled but readabilityContent not loaded yet, wait
    if (useReadability && !article.readabilityContent) return;

    const content = useReadability && article.readabilityContent
      ? article.readabilityContent
      : article.content || article.summary;

    if (!content) return;

    // Mark as requested for this article
    lastAutoSummaryArticleIdRef.current = article.id;

    // Abort previous request if any
    summaryAbortRef.current?.abort();
    const abortController = new AbortController();
    summaryAbortRef.current = abortController;

    const generateSummary = async () => {
      setIsLoadingSummary(true);
      setSummaryError(null);
      setAiSummary("");
      try {
        const isReadability = useReadability && !!article.readabilityContent;

        const res = await fetch("/api/ai/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: article.id,
            content,
            title: article.title,
            isReadability,
          }),
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) return;

        if (!res.ok) {
          let errorMessage = `Summary failed (${res.status})`;
          try {
            const data = await res.json();
            errorMessage = data.error || errorMessage;
          } catch {
            // Ignore
          }
          throw new Error(errorMessage);
        }

        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const data = await res.json();
          if (abortController.signal.aborted) return;
          setAiSummary(data.summary);
        } else {
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let fullText = "";

          while (true) {
            if (abortController.signal.aborted) {
              reader.cancel();
              return;
            }
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
            if (!abortController.signal.aborted) {
              setAiSummary(fullText);
            }
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Summary failed";
        setSummaryError(message);
        setAiSummary(null);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingSummary(false);
        }
      }
    };

    generateSummary();

    return () => {
      abortController.abort();
    };
  }, [alwaysSummary, aiEnabled, article?.id, useReadability, article?.readabilityContent]);

  const handleTranslate = useCallback(() => {
    if (!article) return;

    if (isLoadingTranslation) {
      translationAbortRef.current?.abort();
      setIsLoadingTranslation(false);
      setTranslateEnabled(false);
      // Set translationDisabled to sync with list
      if (onArticleUpdate) {
        onArticleUpdate({
          ...article,
          translationDisabled: true,
        });
      }
      return;
    }

    if (translateEnabled) {
      setTranslateEnabled(false);
      setTranslationError(null);
      if (onArticleUpdate) {
        onArticleUpdate({
          ...article,
          translationDisabled: true,
        });
      }
    } else {
      setTranslateEnabled(true);
      if (onArticleUpdate) {
        onArticleUpdate({
          ...article,
          translationDisabled: false,
        });
      }
    }
  }, [article, isLoadingTranslation, translateEnabled, onArticleUpdate]);

  // Track if there was selection before mousedown
  const hadSelectionOnMouseDown = useRef(false);
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection();
    hadSelectionOnMouseDown.current = !!(
      selection &&
      !selection.isCollapsed &&
      selection.toString().trim()
    );
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("a") || target.closest("button")) return;

    // Double/triple click: let browser handle native selection
    if (e.detail > 1) return;

    // Check for drag
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      // If moved significantly, consider it a drag/select operation
      if (dx > 5 || dy > 5) return;
    }

    // Only clear if there was selection before mousedown
    // This prevents clearing drag-to-select
    if (hadSelectionOnMouseDown.current) {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  if (!article) {
    return (
      <div className="flex h-full flex-col bg-background/50">
        {onBack && (
          <div className="flex h-14 items-center border-b px-4 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Button>
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
          <RssIcon className="mb-4 h-12 w-12 opacity-10" />
          <p className="text-lg font-medium">Select an article to read</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto bg-background"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Toolbar */}
      <TooltipProvider>
        <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8 mr-auto"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Button>
          )}
          <div className="flex items-center gap-1 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 text-muted-foreground hover:text-foreground",
                    useReadability && "bg-accent text-accent-foreground",
                    readabilityError &&
                      "text-destructive hover:text-destructive"
                  )}
                  onClick={handleToggleReadability}
                  disabled={isLoadingReadability}
                >
                  {isLoadingReadability ? (
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookOpenIcon className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {readabilityError ||
                    (useReadability
                      ? t("article.readability.show_original")
                      : t("article.readability.read_mode"))}
                </p>
              </TooltipContent>
            </Tooltip>

            {aiEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8 text-muted-foreground hover:text-foreground",
                      aiSummary && "bg-accent text-accent-foreground",
                      summaryError && "text-destructive hover:text-destructive"
                    )}
                    onClick={handleGenerateSummary}
                  >
                    {isLoadingSummary ? (
                      <LoaderIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <SparklesIcon className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {summaryError ||
                      (isLoadingSummary
                        ? t("article.summary.cancel")
                        : aiSummary
                          ? t("article.summary.hide")
                          : t("article.summary.generate"))}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}

            {aiEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8 text-muted-foreground hover:text-foreground",
                      translateEnabled && "bg-accent text-accent-foreground",
                      translationError &&
                        "text-destructive hover:text-destructive"
                    )}
                    onClick={handleTranslate}
                  >
                    {isLoadingTranslation ? (
                      <LoaderIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <LanguagesIcon className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {translationError ||
                      (isLoadingTranslation
                        ? t("article.translate.cancel")
                        : translateEnabled
                          ? t("article.translate.show_original")
                          : t("article.translate.ai_translate"))}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 text-muted-foreground hover:text-foreground",
                    article.isStarred && "text-yellow-500 hover:text-yellow-600"
                  )}
                  onClick={() => onToggleStar?.(article)}
                >
                  {article.isStarred ? (
                    <StarIcon className="h-4 w-4 fill-current" />
                  ) : (
                    <StarIcon className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {article.isStarred
                    ? t("article.actions.unstar")
                    : t("article.actions.star")}
                </p>
              </TooltipContent>
            </Tooltip>

            <div className="h-4 w-px bg-border/50 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  asChild
                >
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("article.actions.open_original")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>

      <div className="mx-auto max-w-3xl px-8 py-10">
        {/* Article Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
            {displayTitle}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer">
              {article.feed.imageUrl ? (
                <img
                  src={`/api/icons/${article.feed.imageUrl}`}
                  alt=""
                  className="h-4 w-4 rounded-sm object-cover"
                />
              ) : (
                <RssIcon className="h-4 w-4" />
              )}
              <span className="font-medium">{article.feed.title}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <ClockIcon className="h-3.5 w-3.5" />
              <span>{formatRelativeTime(article.pubDate)}</span>
            </div>
          </div>

          {/* AI Errors */}
          {(translationError || summaryError) && (
            <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                <span className="text-sm">
                  {translationError || summaryError}
                </span>
              </div>
            </div>
          )}

          {/* AI Summary */}
          <AiSummaryBox content={aiSummary} />
        </header>

        {/* Article Content */}
        <article className="article-content max-w-none">
          {displayContent ? (
            <ArticleContent content={displayContent} articleLink={article.link} />
          ) : article.summary ? (
            <div className="text-foreground leading-relaxed">
              <p>{article.summary}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-muted/30 rounded-lg">
              <RssIcon className="mb-4 h-10 w-10 text-muted-foreground/30" />
              <p className="text-muted-foreground mb-4">
                {t("article.content.no_content")}
              </p>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLinkIcon className="mr-2 h-4 w-4" />
                  {t("article.actions.open_original")}
                </a>
              </Button>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

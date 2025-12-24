"use client";

import { useEffect, useRef, useCallback, memo } from "react";
import { RefreshCwIcon, CheckCircleIcon, MenuIcon } from "lucide-react";
import striptags from "striptags";
import { Button } from "@/components/ui/button";
import { LazyImage } from "@/components/ui/lazy-image";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { needsTranslation } from "@/lib/language-detect";
import { useTranslation } from "react-i18next";
import { useArticleTranslation } from "@/hooks/use-article-translation";
import { translateArticlesBatch } from "@/lib/services/translation-service";
import type { Article } from "@/lib/types";

interface ArticleListProps {
  title: string;
  articles: Article[];
  selectedArticleId: string | null;
  onSelectArticle: (article: Article) => void;
  onRefresh: () => void;
  onMarkAllRead: () => Promise<void>;
  loading?: boolean;
  autoTranslate?: boolean;
  targetLanguage?: string;
  aiEnabled?: boolean;
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}

interface ArticleListItemProps {
  article: Article;
  isSelected: boolean;
  onClick: () => void;
  formatDate: (dateStr: string | null) => string;
  autoTranslate: boolean;
  targetLanguage: string;
}

/**
 * Single article list item with translation support
 */
const ArticleListItem = memo(function ArticleListItem({
  article,
  isSelected,
  onClick,
  formatDate,
  autoTranslate,
  targetLanguage,
}: ArticleListItemProps) {
  // Get translation from global store
  const translation = useArticleTranslation({
    articleId: article.id,
    language: targetLanguage,
    enabled: autoTranslate && !article.translationDisabled,
  });

  // Use translated content if available
  const displayTitle = translation?.title || article.title;
  const displaySummary = translation?.summary || article.summary;

  return (
    <button
      data-article-id={article.id}
      onClick={onClick}
      className={cn(
        "group relative flex w-full gap-3 px-4 py-4 text-left transition-all hover:bg-accent/50",
        isSelected ? "bg-accent shadow-sm" : "",
        article.isRead ? "opacity-75" : ""
      )}
    >
      {/* Unread Indicator */}
      {!article.isRead && (
        <div className="absolute left-1.5 top-6 h-1.5 w-1.5 rounded-full bg-orange-500" />
      )}

      {/* Feed Icon */}
      <div className="mt-0.5 shrink-0">
        {article.feed.imageUrl ? (
          <img
            src={`/api/icons/${article.feed.imageUrl}`}
            alt=""
            className="h-5 w-5 rounded-sm object-cover"
          />
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-muted text-[10px] font-bold">
            {article.feed.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground/70">
            {article.feed.title}
          </span>
          <span>·</span>
          <span className="shrink-0">
            {formatDate(article.pubDate || article.createdAt)}
          </span>
        </div>

        <h3
          className={cn(
            "line-clamp-2 text-[15px] font-bold leading-snug text-foreground",
            article.isRead && "font-normal text-muted-foreground"
          )}
        >
          {displayTitle}
        </h3>

        {displaySummary && (
          <p className="line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed mt-0.5">
            {striptags(displaySummary)}
          </p>
        )}
      </div>

      {/* Thumbnail */}
      {article.imageUrl && (
        <div className="shrink-0 pl-1">
          <LazyImage
            src={`/api/proxy/image?url=${encodeURIComponent(article.imageUrl)}`}
            alt=""
            containerClassName="h-16 w-16 rounded-md border border-border/40"
            className="h-full w-full object-cover"
          />
        </div>
      )}
    </button>
  );
});

export function ArticleList({
  title,
  articles,
  selectedArticleId,
  onSelectArticle,
  onRefresh,
  onMarkAllRead,
  loading,
  autoTranslate,
  targetLanguage,
  aiEnabled = true,
  showMenuButton,
  onMenuClick,
}: ArticleListProps) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleArticleIds = useRef<Set<string>>(new Set());
  const translateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateAbortRef = useRef<AbortController | null>(null);
  const translatedArticleIds = useRef<Set<string>>(new Set());

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return t("time.unknown");
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return t("time.unknown");
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Future date
    if (diff < 0) {
      const futureDiff = -diff;
      const futureMinutes = Math.floor(futureDiff / (1000 * 60));
      const futureHours = Math.floor(futureDiff / (1000 * 60 * 60));
      const futureDays = Math.floor(futureHours / 24);

      if (futureMinutes < 60)
        return t("time.in_minutes", { count: futureMinutes });
      if (futureHours < 24) return t("time.in_hours", { count: futureHours });
      if (futureDays === 1) return t("time.tomorrow");
      if (futureDays < 7) return t("time.in_days", { count: futureDays });

      return date.toLocaleDateString(
        i18n.language === "zh" ? "zh-CN" : "en-US",
        { month: "short", day: "numeric" }
      );
    }

    // Past date
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 60) return t("time.minutes_ago", { count: minutes });
    if (hours < 24) return t("time.hours_ago", { count: hours });

    const days = Math.floor(hours / 24);
    if (days === 1) return t("time.yesterday");
    if (days < 7) return t("time.days_ago", { count: days });

    return date.toLocaleDateString(i18n.language === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function groupArticlesByDate(articles: Article[]): Map<string, Article[]> {
    const groups = new Map<string, Article[]>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const unknownLabel = t("time.unknown");

    for (const article of articles) {
      const pubDate = article.pubDate
        ? new Date(article.pubDate)
        : new Date(article.createdAt);
      if (Number.isNaN(pubDate.getTime())) {
        if (!groups.has(unknownLabel)) {
          groups.set(unknownLabel, []);
        }
        groups.get(unknownLabel)!.push(article);
        continue;
      }
      pubDate.setHours(0, 0, 0, 0);

      let key: string;
      if (pubDate.getTime() === today.getTime()) {
        key = t("time.today");
      } else if (pubDate.getTime() === yesterday.getTime()) {
        key = t("time.yesterday");
      } else if (pubDate.getTime() === tomorrow.getTime()) {
        key = t("time.tomorrow");
      } else if (pubDate.getTime() > today.getTime()) {
        key = pubDate.toLocaleDateString(
          i18n.language === "zh" ? "zh-CN" : "en-US",
          {
            year: "numeric",
            month: "long",
            day: "numeric",
          }
        );
      } else {
        key = pubDate.toLocaleDateString(
          i18n.language === "zh" ? "zh-CN" : "en-US",
          {
            year: "numeric",
            month: "long",
            day: "numeric",
          }
        );
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(article);
    }

    return groups;
  }

  // Create articles map for quick lookup
  const articlesMap = new Map(articles.map((a) => [a.id, a]));

  // Translate visible articles
  const translateVisibleArticles = useCallback(async () => {
    if (!autoTranslate || !aiEnabled || !targetLanguage) return;

    // Collect articles that need translation
    const articlesToTranslate: Array<{
      id: string;
      title: string;
      summary: string | null;
    }> = [];

    for (const articleId of visibleArticleIds.current) {
      const article = articlesMap.get(articleId);
      if (
        article &&
        !article.translationDisabled &&
        !translatedArticleIds.current.has(articleId) &&
        needsTranslation(article.title, article.summary, targetLanguage)
      ) {
        articlesToTranslate.push({
          id: article.id,
          title: article.title,
          summary: article.summary,
        });
        translatedArticleIds.current.add(articleId);
      }
    }

    if (articlesToTranslate.length === 0) return;

    // Create new AbortController
    translateAbortRef.current?.abort();
    const abortController = new AbortController();
    translateAbortRef.current = abortController;

    try {
      await translateArticlesBatch(articlesToTranslate, abortController.signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Batch translation error:", error);
      // On error, remove from translated set to allow retry
      for (const article of articlesToTranslate) {
        translatedArticleIds.current.delete(article.id);
      }
    }
  }, [autoTranslate, aiEnabled, targetLanguage, articlesMap]);

  // Debounced translate trigger
  const scheduleTranslation = useCallback(() => {
    if (translateTimeoutRef.current) {
      clearTimeout(translateTimeoutRef.current);
    }
    translateTimeoutRef.current = setTimeout(() => {
      translateVisibleArticles();
    }, 1000);
  }, [translateVisibleArticles]);

  // Set up Intersection Observer
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (!autoTranslate) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const articleId = entry.target.getAttribute("data-article-id");
          if (!articleId) continue;

          if (entry.isIntersecting) {
            visibleArticleIds.current.add(articleId);
          } else {
            visibleArticleIds.current.delete(articleId);
          }
        }
        scheduleTranslation();
      },
      {
        root: containerRef.current,
        rootMargin: "50px",
        threshold: 0,
      }
    );

    observerRef.current = observer;

    // Observe all article elements
    const container = containerRef.current;
    if (container) {
      const elements = container.querySelectorAll("[data-article-id]");
      elements.forEach((el) => observer.observe(el));
    }

    return () => {
      observer.disconnect();
      if (translateTimeoutRef.current) {
        clearTimeout(translateTimeoutRef.current);
      }
    };
  }, [autoTranslate, scheduleTranslation, articles]);

  // Reset when article IDs change
  const articleIdsKey = articles.map((a) => a.id).join(",");
  useEffect(() => {
    translateAbortRef.current?.abort();
    translateAbortRef.current = null;
    visibleArticleIds.current.clear();
    translatedArticleIds.current.clear();
  }, [articleIdsKey]);

  const groupedArticles = groupArticlesByDate(articles);

  return (
    <div className="flex h-full flex-col border-r bg-background">
      <div className="flex h-14 items-center justify-between px-4 shrink-0 md:h-16">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showMenuButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="h-8 w-8 shrink-0"
            >
              <MenuIcon className="h-5 w-5" />
            </Button>
          )}
          <h2 className="font-bold text-lg md:text-xl tracking-tight truncate">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={t("feedlist.refresh")}
          >
            <RefreshCwIcon
              className={cn("h-4 w-4", loading && "animate-spin")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onMarkAllRead}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={t("feeds.mark_all_button")}
          >
            <CheckCircleIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {articles.length === 0 ? (
          loading ? (
            <div className="p-4 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-5 w-5 rounded-sm" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
              <p>{t("articles.empty.title")}</p>
              <p className="text-xs">{t("articles.empty.subtitle")}</p>
            </div>
          )
        ) : (
          <div className="pb-4">
            {Array.from(groupedArticles.entries()).map(
              ([date, dateArticles]) => (
                <div key={date}>
                  <div className="sticky top-0 z-10 bg-background px-4 py-2 text-xs font-medium text-muted-foreground">
                    {date}
                  </div>
                  <div className="space-y-0.5">
                    {dateArticles.map((article) => (
                      <ArticleListItem
                        key={article.id}
                        article={article}
                        isSelected={selectedArticleId === article.id}
                        onClick={() => onSelectArticle(article)}
                        formatDate={formatDate}
                        autoTranslate={autoTranslate ?? false}
                        targetLanguage={targetLanguage ?? "en"}
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

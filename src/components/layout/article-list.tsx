"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { RefreshCwIcon, CheckCircleIcon, MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { needsTranslation } from "@/lib/language-detect";
import { useTranslation } from "react-i18next";
import type { Article } from "@/lib/types";

interface ArticleListProps {
  title: string;
  articles: Article[];
  selectedArticleId: string | null;
  onSelectArticle: (article: Article) => void;
  onRefresh: () => void;
  onMarkAllRead: () => Promise<void>;
  onUpdateArticles?: (articles: Article[]) => void;
  loading?: boolean;
  autoTranslate?: boolean;
  targetLanguage?: string;
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}

export function ArticleList({
  title,
  articles,
  selectedArticleId,
  onSelectArticle,
  onRefresh,
  onMarkAllRead,
  onUpdateArticles,
  loading,
  autoTranslate,
  targetLanguage,
  showMenuButton,
  onMenuClick,
}: ArticleListProps) {
  const { t, i18n } = useTranslation();

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
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
        { month: "short", day: "numeric" },
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

    for (const article of articles) {
      const pubDate = article.pubDate
        ? new Date(article.pubDate)
        : new Date(article.createdAt);
      pubDate.setHours(0, 0, 0, 0);

      let key: string;
      if (pubDate.getTime() === today.getTime()) {
        key = t("time.today");
      } else if (pubDate.getTime() === yesterday.getTime()) {
        key = t("time.yesterday");
      } else if (pubDate.getTime() === tomorrow.getTime()) {
        key = t("time.tomorrow");
      } else if (pubDate.getTime() > today.getTime()) {
        // Future date
        key = pubDate.toLocaleDateString(
          i18n.language === "zh" ? "zh-CN" : "en-US",
          {
            year: "numeric",
            month: "long",
            day: "numeric",
          },
        );
      } else {
        key = pubDate.toLocaleDateString(
          i18n.language === "zh" ? "zh-CN" : "en-US",
          {
            year: "numeric",
            month: "long",
            day: "numeric",
          },
        );
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(article);
    }

    return groups;
  }

  const groupedArticles = groupArticlesByDate(articles);
  const containerRef = useRef<HTMLDivElement>(null);
  const articleRefs = useRef<Map<string, HTMLElement>>(new Map());
  const visibleArticleIds = useRef<Set<string>>(new Set());
  const translatingIds = useRef<Set<string>>(new Set());
  const translateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Use ref to always have access to the latest articles (avoid closure issues)
  const articlesRef = useRef(articles);
  articlesRef.current = articles;

  // Translate visible articles
  const translateVisibleArticles = useCallback(async () => {
    if (!autoTranslate || !onUpdateArticles || !targetLanguage) return;

    // Use ref to get latest articles (avoid closure issues)
    const currentArticles = articlesRef.current;

    // Collect articles that need translation (visible, not yet translated, and not in target language)
    const articlesToTranslate = currentArticles.filter(
      (article) =>
        visibleArticleIds.current.has(article.id) &&
        !article.translatedTitle &&
        !translatingIds.current.has(article.id) &&
        needsTranslation(article.title, article.summary, targetLanguage),
    );

    if (articlesToTranslate.length === 0) return;

    // Mark as translating
    for (const article of articlesToTranslate) {
      translatingIds.current.add(article.id);
    }
    setIsTranslating(true);

    try {
      const res = await fetch("/api/ai/translate-lite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articles: articlesToTranslate.map((a) => ({
            id: a.id,
            title: a.title,
            summary: a.summary,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error("Translation failed");
      }

      const data = await res.json();
      const translations = data.translations as Record<
        string,
        { title: string; summary: string | null }
      >;

      // Update articles with translations (use latest ref)
      const latestArticles = articlesRef.current;
      const updatedArticles = latestArticles.map((article) => {
        const translation = translations[article.id];
        if (translation) {
          return {
            ...article,
            translatedTitle: translation.title,
            translatedSummary: translation.summary || undefined,
          };
        }
        return article;
      });

      onUpdateArticles(updatedArticles);
    } catch (error) {
      console.error("Auto-translate error:", error);
      // Remove from translating set on error so they can be retried
      for (const article of articlesToTranslate) {
        translatingIds.current.delete(article.id);
      }
    } finally {
      setIsTranslating(false);
    }
  }, [autoTranslate, onUpdateArticles, targetLanguage]);

  // Debounced translate trigger
  const scheduleTranslation = useCallback(() => {
    if (translateTimeoutRef.current) {
      clearTimeout(translateTimeoutRef.current);
    }
    translateTimeoutRef.current = setTimeout(() => {
      translateVisibleArticles();
    }, 300);
  }, [translateVisibleArticles]);

  // Store scheduleTranslation in ref to avoid dependency issues
  const scheduleTranslationRef = useRef(scheduleTranslation);
  scheduleTranslationRef.current = scheduleTranslation;

  // Set up Intersection Observer for visible articles detection
  useEffect(() => {
    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
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
        scheduleTranslationRef.current();
      },
      {
        root: containerRef.current,
        rootMargin: "50px",
        threshold: 0,
      },
    );

    // Store observer in ref for dynamic observation
    observerRef.current = observer;

    // Observe all existing article elements
    articleRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (translateTimeoutRef.current) {
        clearTimeout(translateTimeoutRef.current);
      }
    };
  }, [autoTranslate]);

  // Reset translating IDs only when article IDs change (not when translations are added)
  const articleIdsKey = articles.map((a) => a.id).join(",");
  useEffect(() => {
    translatingIds.current.clear();
    visibleArticleIds.current.clear();
  }, [articleIdsKey]);

  // Register article ref and observe for visibility
  const registerArticleRef = useCallback(
    (id: string, element: HTMLElement | null) => {
      if (element) {
        articleRefs.current.set(id, element);
        // Observe new element if observer exists
        if (observerRef.current) {
          observerRef.current.observe(element);
        }
      } else {
        const existingElement = articleRefs.current.get(id);
        if (existingElement && observerRef.current) {
          observerRef.current.unobserve(existingElement);
        }
        articleRefs.current.delete(id);
        visibleArticleIds.current.delete(id);
      }
    },
    [],
  );

  return (
    <div className="flex h-full flex-col border-r bg-background">
      <div className="flex h-14 items-center justify-between px-4 shrink-0 border-b md:h-16 md:border-b-0">
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
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
            <p>{t("articles.empty.title")}</p>
            <p className="text-xs">{t("articles.empty.subtitle")}</p>
          </div>
        ) : (
          <div className="pb-4">
            {Array.from(groupedArticles.entries()).map(
              ([date, dateArticles]) => (
                <div key={date}>
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-3 text-sm font-bold text-foreground">
                    {date}
                  </div>
                  <div className="space-y-0.5">
                    {dateArticles.map((article) => (
                      <button
                        key={article.id}
                        ref={(el) => registerArticleRef(article.id, el)}
                        data-article-id={article.id}
                        onClick={() => onSelectArticle(article)}
                        className={cn(
                          "group relative flex w-full gap-3 px-4 py-4 text-left transition-all hover:bg-accent/50",
                          selectedArticleId === article.id
                            ? "bg-accent shadow-sm"
                            : "",
                          article.isRead ? "opacity-75" : "",
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
                              article.isRead &&
                                "font-normal text-muted-foreground",
                            )}
                          >
                            {article.translatedTitle || article.title}
                          </h3>

                          {(article.translatedSummary || article.summary) && (
                            <p className="line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed mt-0.5">
                              {(
                                article.translatedSummary ||
                                article.summary ||
                                ""
                              ).replace(/<[^>]*>/g, "")}
                            </p>
                          )}
                        </div>

                        {/* Thumbnail */}
                        {article.imageUrl && (
                          <div className="shrink-0 pl-1">
                            <img
                              src={`/api/proxy/image?url=${encodeURIComponent(article.imageUrl)}`}
                              alt=""
                              className="h-16 w-16 rounded-md object-cover bg-muted border border-border/40"
                            />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

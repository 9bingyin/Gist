"use client";

import { RefreshCwIcon, CheckIcon, CheckCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Article } from "@/lib/types";

interface ArticleListProps {
  title: string;
  articles: Article[];
  selectedArticleId: string | null;
  onSelectArticle: (article: Article) => void;
  onRefresh: () => void;
  onMarkAllRead: () => Promise<void>;
  loading?: boolean;
}

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

    if (futureMinutes < 60) return `${futureMinutes}分钟后`;
    if (futureHours < 24) return `${futureHours}小时后`;
    if (futureDays === 1) return "明天";
    if (futureDays < 7) return `${futureDays}天后`;

    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  }

  // Past date
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
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
    const pubDate = article.pubDate ? new Date(article.pubDate) : new Date(article.createdAt);
    pubDate.setHours(0, 0, 0, 0);

    let key: string;
    if (pubDate.getTime() === today.getTime()) {
      key = "今天";
    } else if (pubDate.getTime() === yesterday.getTime()) {
      key = "昨天";
    } else if (pubDate.getTime() === tomorrow.getTime()) {
      key = "明天";
    } else if (pubDate.getTime() > today.getTime()) {
      // Future date
      key = pubDate.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } else {
      key = pubDate.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(article);
  }

  return groups;
}

export function ArticleList({
  title,
  articles,
  selectedArticleId,
  onSelectArticle,
  onRefresh,
  onMarkAllRead,
  loading,
}: ArticleListProps) {
  const groupedArticles = groupArticlesByDate(articles);

  return (
    <div className="flex h-full flex-col border-r bg-background">
      <div className="flex h-16 items-center justify-between px-4 shrink-0">
        <h2 className="font-bold text-xl tracking-tight truncate min-w-0 flex-1 mr-2">{title}</h2>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="刷新"
          >
            <RefreshCwIcon className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onMarkAllRead}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="全部已读"
          >
            <CheckCircleIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {articles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
            <p>暂无文章</p>
            <p className="text-xs">添加订阅源以开始阅读</p>
          </div>
        ) : (
          <div className="pb-4">
            {Array.from(groupedArticles.entries()).map(([date, dateArticles]) => (
              <div key={date}>
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-3 text-sm font-bold text-foreground">
                  {date}
                </div>
                <div className="space-y-0.5">
                  {dateArticles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => onSelectArticle(article)}
                      className={cn(
                        "group relative flex w-full gap-3 px-4 py-4 text-left transition-all hover:bg-accent/50",
                        selectedArticleId === article.id ? "bg-accent shadow-sm" : "",
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
                          <span className="truncate font-medium text-foreground/70">{article.feed.title}</span>
                          <span>·</span>
                          <span className="shrink-0">{formatDate(article.pubDate || article.createdAt)}</span>
                        </div>
                        
                        <h3 className={cn(
                          "line-clamp-2 text-[15px] font-bold leading-snug text-foreground",
                          article.isRead && "font-normal text-muted-foreground"
                        )}>
                          {article.translatedTitle || article.title}
                        </h3>
                        
                        {(article.translatedSummary || article.summary) && (
                          <p className="line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed mt-0.5">
                            {(article.translatedSummary || article.summary || '').replace(/<[^>]*>/g, '')}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

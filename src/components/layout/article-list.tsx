"use client";

import { RefreshCwIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Article } from "@/lib/types";

interface ArticleListProps {
  articles: Article[];
  selectedArticleId: string | null;
  onSelectArticle: (article: Article) => void;
  onRefresh: () => void;
  loading?: boolean;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function groupArticlesByDate(articles: Article[]): Map<string, Article[]> {
  const groups = new Map<string, Article[]>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const article of articles) {
    const pubDate = article.pubDate ? new Date(article.pubDate) : new Date(article.createdAt);
    pubDate.setHours(0, 0, 0, 0);

    let key: string;
    if (pubDate.getTime() === today.getTime()) {
      key = "Today";
    } else if (pubDate.getTime() === yesterday.getTime()) {
      key = "Yesterday";
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
  articles,
  selectedArticleId,
  onSelectArticle,
  onRefresh,
  loading,
}: ArticleListProps) {
  const groupedArticles = groupArticlesByDate(articles);

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <h2 className="text-lg font-semibold">Articles</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 w-8"
          >
            <RefreshCwIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {articles.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
            <p>No articles yet. Add a feed to get started.</p>
          </div>
        ) : (
          <div className="p-2">
            {Array.from(groupedArticles.entries()).map(([date, dateArticles]) => (
              <div key={date}>
                <div className="px-2 py-2 text-sm font-medium text-muted-foreground">
                  {date}
                </div>
                {dateArticles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => onSelectArticle(article)}
                    className={`group relative flex w-full gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent ${
                      selectedArticleId === article.id ? "bg-accent" : ""
                    } ${article.isRead ? "opacity-60" : ""}`}
                  >
                    {article.feed.imageUrl ? (
                      <img
                        src={article.feed.imageUrl}
                        alt=""
                        className="mt-0.5 h-5 w-5 shrink-0 rounded"
                      />
                    ) : (
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-orange-500 text-[10px] font-bold text-white">
                        {article.feed.title.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{article.feed.title}</span>
                        <span>·</span>
                        <span className="shrink-0">{formatDate(article.pubDate)}</span>
                      </div>
                      <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug">
                        {article.title}
                      </h3>
                      {article.summary && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {article.summary}
                        </p>
                      )}
                    </div>
                    {article.imageUrl && (
                      <img
                        src={article.imageUrl}
                        alt=""
                        className="h-16 w-20 shrink-0 rounded-md object-cover"
                      />
                    )}
                    {article.isRead && (
                      <CheckIcon className="absolute right-2 top-2 h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                ))}
                <Separator className="my-2" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

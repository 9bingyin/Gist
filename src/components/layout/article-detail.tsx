"use client";

import { ExternalLinkIcon, RssIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Article } from "@/lib/types";

interface ArticleDetailProps {
  article: Article | null;
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ArticleDetail({ article }: ArticleDetailProps) {
  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <RssIcon className="mb-4 h-12 w-12 opacity-20" />
        <p className="text-lg">Select an article to read</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {article.feed.imageUrl ? (
            <img src={article.feed.imageUrl} alt="" className="h-5 w-5 rounded" />
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded bg-orange-500 text-[10px] font-bold text-white">
              {article.feed.title.charAt(0).toUpperCase()}
            </div>
          )}
          <span>{article.feed.title}</span>
          <span>·</span>
          <span>{formatFullDate(article.pubDate)}</span>
        </div>
        <h1 className="mt-3 text-2xl font-bold leading-tight">{article.title}</h1>
        <div className="mt-4">
          <Button variant="outline" size="sm" asChild>
            <a href={article.link} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="mr-2 h-4 w-4" />
              Open Original
            </a>
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <article className="prose prose-neutral dark:prose-invert max-w-none p-6">
          {article.content ? (
            <div dangerouslySetInnerHTML={{ __html: article.content }} />
          ) : article.summary ? (
            <p>{article.summary}</p>
          ) : (
            <p className="text-muted-foreground">
              No content available. Click "Open Original" to read the full article.
            </p>
          )}
        </article>
      </ScrollArea>
    </div>
  );
}

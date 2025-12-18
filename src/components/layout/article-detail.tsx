"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import DOMPurify from "dompurify";
import {
  ExternalLinkIcon,
  RssIcon,
  UserIcon,
  ClockIcon,
  BookOpenIcon,
  Share2Icon,
  BookmarkIcon,
  MoreHorizontalIcon,
  LoaderIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Article } from "@/lib/types";

interface ArticleDetailProps {
  article: Article | null;
  onArticleUpdate?: (article: Article) => void;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffWeeks < 4) return `${diffWeeks} 周前`;
  if (diffMonths < 12) return `${diffMonths} 个月前`;
  return `${diffYears} 年前`;
}

function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") {
    return html;
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li",
      "blockquote", "pre", "code",
      "a", "img", "figure", "figcaption",
      "table", "thead", "tbody", "tr", "th", "td",
      "hr", "div", "span", "sup", "sub",
      "video", "source", "audio",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "class", "id",
      "target", "rel", "width", "height",
      "controls", "autoplay", "loop", "muted", "poster",
      "type", "colspan", "rowspan",
    ],
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "style", "iframe", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });
}

function processContent(content: string): string {
  let processed = sanitizeHtml(content);

  // Add target="_blank" to all links
  processed = processed.replace(
    /<a\s+(?![^>]*target=)/gi,
    '<a target="_blank" rel="noopener noreferrer" '
  );

  // Add loading="lazy" to images
  processed = processed.replace(
    /<img\s+(?![^>]*loading=)/gi,
    '<img loading="lazy" '
  );

  return processed;
}

export function ArticleDetail({ article, onArticleUpdate }: ArticleDetailProps) {
  const [isLoadingReadability, setIsLoadingReadability] = useState(false);
  const [useReadability, setUseReadability] = useState(false);

  // Reset readability mode when article changes
  useEffect(() => {
    setUseReadability(false);
  }, [article?.id]);

  const processedContent = useMemo(() => {
    if (!article) return null;
    const content = useReadability
      ? article.readabilityContent
      : article.content;
    if (!content) return null;
    return processContent(content);
  }, [article, useReadability]);

  const handleToggleReadability = useCallback(async () => {
    if (!article || isLoadingReadability) return;

    // If turning off, just toggle
    if (useReadability) {
      setUseReadability(false);
      return;
    }

    // If already have cached content, just toggle on
    if (article.readabilityContent) {
      setUseReadability(true);
      return;
    }

    // Fetch readability content
    setIsLoadingReadability(true);
    try {
      const res = await fetch(`/api/articles/${article.id}/readability`, {
        method: "POST",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch readable content");
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
      console.error("Readability error:", error);
    } finally {
      setIsLoadingReadability(false);
    }
  }, [article, isLoadingReadability, useReadability, onArticleUpdate]);

  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <RssIcon className="mb-4 h-16 w-16 opacity-10" />
        <p className="text-lg font-medium">Select an article to read</p>
        <p className="mt-1 text-sm opacity-60">
          Choose an article from the list to start reading
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Toolbar */}
      <TooltipProvider>
        <div className="sticky top-0 z-10 flex items-center justify-end gap-1 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  useReadability && "bg-accent text-accent-foreground"
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
              <p>{useReadability ? "Show Original" : "Readability"}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Share2Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <BookmarkIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Bookmark</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <a href={article.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Open Original</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>More</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      <div className="mx-auto max-w-3xl px-8 py-8">
        {/* Article Header */}
        <header className="mb-8">
          {/* Title */}
          <h1 className="text-3xl font-bold leading-tight tracking-tight">
            {article.title}
          </h1>

          {/* Meta info: source | author | time */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {/* Source */}
            <div className="flex items-center gap-1.5">
              {article.feed.imageUrl ? (
                <img
                  src={article.feed.imageUrl}
                  alt=""
                  className="h-4 w-4 rounded object-cover"
                />
              ) : (
                <RssIcon className="h-4 w-4" />
              )}
              <span>{article.feed.title}</span>
            </div>

            {/* Author placeholder - use feed title */}
            <div className="flex items-center gap-1.5">
              <UserIcon className="h-4 w-4" />
              <span>{article.feed.title}</span>
            </div>

            {/* Time */}
            {article.pubDate && (
              <div className="flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4" />
                <span>{formatRelativeTime(article.pubDate)}</span>
              </div>
            )}
          </div>
        </header>

        {/* Article Content */}
        <article className="article-content">
          {processedContent ? (
            <div dangerouslySetInnerHTML={{ __html: processedContent }} />
          ) : article.summary ? (
            <div className="text-foreground leading-relaxed">
              <p>{article.summary}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <RssIcon className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground">
                No content available for this article.
              </p>
              <Button variant="outline" size="sm" asChild className="mt-4">
                <a href={article.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="mr-2 h-4 w-4" />
                  Open Original
                </a>
              </Button>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

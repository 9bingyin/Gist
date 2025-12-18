"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";
import { ExternalLinkIcon, RssIcon, CalendarIcon, BookOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

function estimateReadingTime(content: string | null): number {
  if (!content) return 0;
  const text = content.replace(/<[^>]*>/g, "");
  const words = text.trim().split(/\s+/).length;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalWords = words + chineseChars;
  return Math.max(1, Math.ceil(totalWords / 300));
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

export function ArticleDetail({ article }: ArticleDetailProps) {
  const processedContent = useMemo(() => {
    if (!article?.content) return null;
    return processContent(article.content);
  }, [article?.content]);

  const readingTime = useMemo(() => {
    return estimateReadingTime(article?.content || article?.summary || null);
  }, [article?.content, article?.summary]);

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
      <div className="mx-auto max-w-3xl px-8 py-8">
          {/* Article Header */}
          <header className="mb-8">
            {/* Feed info */}
            <div className="mb-4 flex items-center gap-2">
              {article.feed.imageUrl ? (
                <img
                  src={article.feed.imageUrl}
                  alt=""
                  className="h-6 w-6 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                  {article.feed.title.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-muted-foreground">
                {article.feed.title}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              {article.title}
            </h1>

            {/* Meta info */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {article.pubDate && (
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-4 w-4" />
                  <span>{formatFullDate(article.pubDate)}</span>
                </div>
              )}
              {readingTime > 0 && (
                <div className="flex items-center gap-1.5">
                  <BookOpenIcon className="h-4 w-4" />
                  <span>{readingTime} min read</span>
                </div>
              )}
            </div>

            {/* Cover image */}
            {article.imageUrl && (
              <div className="mt-6 overflow-hidden rounded-lg">
                <img
                  src={article.imageUrl}
                  alt=""
                  className="h-auto w-full object-cover"
                  loading="lazy"
                />
              </div>
            )}

            {/* Action button */}
            <div className="mt-6">
              <Button variant="outline" size="sm" asChild>
                <a href={article.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="mr-2 h-4 w-4" />
                  Open Original
                </a>
              </Button>
            </div>
          </header>

          <Separator className="mb-8" />

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
                <p className="mt-1 text-sm text-muted-foreground/60">
                  Click &ldquo;Open Original&rdquo; to read the full article on the source website.
                </p>
              </div>
            )}
          </article>

          {/* Footer */}
          <footer className="mt-12 border-t pt-6">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Published by {article.feed.title}</span>
              <Button variant="ghost" size="sm" asChild>
                <a href={article.link} target="_blank" rel="noopener noreferrer">
                  View on source site
                  <ExternalLinkIcon className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </footer>
        </div>
    </div>
  );
}

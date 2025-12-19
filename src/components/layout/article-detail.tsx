"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import DOMPurify from "dompurify";
import {
  ExternalLinkIcon,
  RssIcon,
  ClockIcon,
  BookOpenIcon,
  Share2Icon,
  BookmarkIcon,
  MoreHorizontalIcon,
  LoaderIcon,
  SparklesIcon,
  LanguagesIcon,
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
import type { Article } from "@/lib/types";

interface ArticleDetailProps {
  article: Article | null;
  onArticleUpdate?: (article: Article) => void;
  autoTranslate?: boolean;
  targetLanguage?: string;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Handle future dates
  if (diffMs < 0) {
    const absDiffMs = Math.abs(diffMs);
    const diffMinutes = Math.floor(absDiffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 60) return `${diffMinutes || 1} 分钟后`;
    if (diffHours < 24) return `${diffHours} 小时后`;
    if (diffDays < 7) return `${diffDays} 天后`;
    return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
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
      "hr", "div", "span", "sup", "sub", "small", "mark", "abbr",
      "video", "source", "audio",
      "dl", "dt", "dd", "details", "summary",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "class", "id", "style",
      "target", "rel", "width", "height",
      "controls", "autoplay", "loop", "muted", "poster",
      "type", "colspan", "rowspan", "datetime", "open",
    ],
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "iframe", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });
}

/**
 * Convert relative URL to absolute URL based on the article link
 */
function toAbsoluteUrl(url: string, baseUrl: string | undefined): string | null {
  // Already absolute URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Protocol-relative URL
  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  // Data URI or already proxied - skip
  if (url.startsWith("data:") || url.startsWith("/api/")) {
    return null;
  }

  // Relative URL - need base URL
  if (!baseUrl) return null;

  try {
    const base = new URL(baseUrl);

    // Absolute path (starts with /)
    if (url.startsWith("/")) {
      return `${base.origin}${url}`;
    }

    // Relative path (e.g., "images/photo.jpg" or "../images/photo.jpg")
    const basePath = base.pathname.substring(0, base.pathname.lastIndexOf("/") + 1);
    return `${base.origin}${basePath}${url}`;
  } catch {
    return null;
  }
}

function processContent(content: string, articleLink?: string): string {
  let processed = sanitizeHtml(content);

  // Add target="_blank" to all links
  processed = processed.replace(
    /<a\s+(?![^>]*target=)/gi,
    '<a target="_blank" rel="noopener noreferrer" '
  );

  // Proxy all image URLs (including converting relative paths to absolute)
  processed = processed.replace(
    /<img([^>]*)\ssrc=["']([^"']+)["']/gi,
    (match, attrs, src) => {
      const absoluteUrl = toAbsoluteUrl(src, articleLink);

      // Skip if conversion failed or not applicable (data URIs, already proxied)
      if (!absoluteUrl) {
        return match;
      }

      const proxiedSrc = `/api/proxy/image?url=${encodeURIComponent(absoluteUrl)}`;
      return `<img${attrs} src="${proxiedSrc}"`;
    }
  );

  // Add loading="lazy" to images
  processed = processed.replace(
    /<img\s+(?![^>]*loading=)/gi,
    '<img loading="lazy" '
  );

  return processed;
}

export function ArticleDetail({ article, onArticleUpdate, autoTranslate, targetLanguage }: ArticleDetailProps) {
  const [isLoadingReadability, setIsLoadingReadability] = useState(false);
  const [useReadability, setUseReadability] = useState(false);
  const [readabilityError, setReadabilityError] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(null);
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // Reset readability mode, summary, translation and errors when article changes
  useEffect(() => {
    setUseReadability(false);
    setReadabilityError(null);
    setAiSummary(null);
    setSummaryError(null);
    setTranslatedContent(null);
    setTranslatedTitle(null);
    setTranslatedSummary(null);
    setTranslationError(null);
  }, [article?.id]);

  // Auto-translate when article changes and autoTranslate is enabled
  useEffect(() => {
    const autoTranslateContent = async () => {
      if (!autoTranslate || !article || !targetLanguage || isLoadingTranslation || translatedContent) return;

      // Skip if article is already in target language
      if (!needsTranslation(article.title, article.summary, targetLanguage)) return;

      const content = article.content || article.summary;
      if (!content) return;

      setIsLoadingTranslation(true);
      setTranslationError(null);
      try {
        const res = await fetch("/api/ai/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: article.id,
            content,
            title: article.title,
            summary: article.summary,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Translation failed");
        }

        setTranslatedContent(data.content);
        setTranslatedTitle(data.title);
        setTranslatedSummary(data.summary);

        // Update article with translated title/summary for article list
        if (onArticleUpdate && (data.title || data.summary)) {
          onArticleUpdate({
            ...article,
            translatedTitle: data.title || undefined,
            translatedSummary: data.summary || undefined,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Translation failed";
        setTranslationError(message);
        console.error("Auto-translate error:", error);
      } finally {
        setIsLoadingTranslation(false);
      }
    };

    autoTranslateContent();
  }, [article?.id, autoTranslate, targetLanguage]);

  // Regenerate summary when readability mode changes (if summary was already shown)
  useEffect(() => {
    const regenerateSummary = async () => {
      if (!aiSummary || isLoadingSummary || !article) return;

      setIsLoadingSummary(true);
      setSummaryError(null);
      try {
        const content = useReadability
          ? (article.readabilityContent || article.content || article.summary)
          : (article.content || article.summary);

        if (!content) {
          throw new Error("无可用内容进行概括");
        }

        const res = await fetch("/api/ai/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: article.id,
            content,
            title: article.title,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "生成摘要失败");
        }

        setAiSummary(data.summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : "生成摘要失败";
        setSummaryError(message);
        console.error("Summary error:", error);
      } finally {
        setIsLoadingSummary(false);
      }
    };

    regenerateSummary();
  }, [useReadability]);

  const processedContent = useMemo(() => {
    if (!article) return null;

    // Use translated content if available
    if (translatedContent) {
      return processContent(translatedContent, article.link);
    }

    const content = useReadability
      ? article.readabilityContent
      : article.content;
    if (!content) return null;
    return processContent(content, article.link);
  }, [article, useReadability, translatedContent]);

  const handleToggleReadability = useCallback(async () => {
    if (!article || isLoadingReadability) return;

    // Clear translation when switching readability mode
    setTranslatedContent(null);
    setTranslatedTitle(null);
    setTranslatedSummary(null);
    setTranslationError(null);
    // Restore original title/summary in article list
    if (onArticleUpdate && article) {
      onArticleUpdate({
        ...article,
        translatedTitle: undefined,
        translatedSummary: undefined,
      });
    }

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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch readable content");
      }
      if (data.content && onArticleUpdate) {
        onArticleUpdate({
          ...article,
          readabilityContent: data.content,
        });
        setUseReadability(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取失败";
      setReadabilityError(message);
      console.error("Readability error:", error);
    } finally {
      setIsLoadingReadability(false);
    }
  }, [article, isLoadingReadability, useReadability, onArticleUpdate]);

  const handleGenerateSummary = useCallback(async () => {
    if (!article || isLoadingSummary) return;

    if (aiSummary) {
      setAiSummary(null);
      return;
    }

    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      const content = useReadability
        ? (article.readabilityContent || article.content || article.summary)
        : (article.content || article.summary);

      if (!content) {
        throw new Error("无可用内容进行概括");
      }

      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: article.id,
          content,
          title: article.title,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "生成摘要失败");
      }

      setAiSummary(data.summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成摘要失败";
      setSummaryError(message);
      console.error("Summary error:", error);
    } finally {
      setIsLoadingSummary(false);
    }
  }, [article, isLoadingSummary, aiSummary, useReadability]);

  const handleTranslate = useCallback(async () => {
    if (!article || isLoadingTranslation) return;

    if (translatedContent) {
      setTranslatedContent(null);
      setTranslatedTitle(null);
      setTranslatedSummary(null);
      // Restore original title/summary in article list
      if (onArticleUpdate) {
        onArticleUpdate({
          ...article,
          translatedTitle: undefined,
          translatedSummary: undefined,
        });
      }
      return;
    }

    setIsLoadingTranslation(true);
    setTranslationError(null);
    try {
      const content = useReadability
        ? (article.readabilityContent || article.content || article.summary)
        : (article.content || article.summary);

      if (!content) {
        throw new Error("无可用内容进行翻译");
      }

      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: article.id,
          content,
          title: article.title,
          summary: article.summary,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "翻译失败");
      }

      setTranslatedContent(data.content);
      setTranslatedTitle(data.title);
      setTranslatedSummary(data.summary);

      // Update article with translated title/summary for article list
      if (onArticleUpdate && (data.title || data.summary)) {
        onArticleUpdate({
          ...article,
          translatedTitle: data.title || undefined,
          translatedSummary: data.summary || undefined,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "翻译失败";
      setTranslationError(message);
      console.error("Translation error:", error);
    } finally {
      setIsLoadingTranslation(false);
    }
  }, [article, isLoadingTranslation, translatedContent, useReadability, onArticleUpdate]);

  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground bg-background/50">
        <RssIcon className="mb-4 h-12 w-12 opacity-10" />
        <p className="text-lg font-medium">选择一篇文章开始阅读</p>
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
                  "h-8 w-8 text-muted-foreground hover:text-foreground",
                  useReadability && "bg-accent text-accent-foreground",
                  readabilityError && "text-destructive hover:text-destructive"
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
              <p>{readabilityError || (useReadability ? "显示原文" : "阅读模式")}</p>
            </TooltipContent>
          </Tooltip>

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
                disabled={isLoadingSummary}
              >
                {isLoadingSummary ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <SparklesIcon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{summaryError || (aiSummary ? "隐藏摘要" : "AI 概括")}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 text-muted-foreground hover:text-foreground",
                  translatedContent && "bg-accent text-accent-foreground",
                  translationError && "text-destructive hover:text-destructive"
                )}
                onClick={handleTranslate}
                disabled={isLoadingTranslation}
              >
                {isLoadingTranslation ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <LanguagesIcon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{translationError || (translatedContent ? "显示原文" : "AI 翻译")}</p>
            </TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-border/50 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Share2Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>分享</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <BookmarkIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>收藏</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" asChild>
                <a href={article.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>打开原文</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>更多</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      <div className="mx-auto max-w-3xl px-8 py-10">
        {/* Article Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
            {translatedTitle || article.title}
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

          {/* AI Summary */}
          {aiSummary && (
            <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <SparklesIcon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-primary">AI 概括</h3>
              </div>
              <div className="text-sm leading-relaxed text-foreground space-y-2">
                {aiSummary.split('\n').filter(line => line.trim()).map((point, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-primary mt-1.5 shrink-0">•</span>
                    <span className="flex-1">{point.trim()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* Article Content */}
        <article className="article-content max-w-none">
          {processedContent ? (
            <div dangerouslySetInnerHTML={{ __html: processedContent }} />
          ) : article.summary ? (
            <div className="text-foreground leading-relaxed">
              <p>{article.summary}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-muted/30 rounded-lg">
              <RssIcon className="mb-4 h-10 w-10 text-muted-foreground/30" />
              <p className="text-muted-foreground mb-4">
                无法获取该文章的正文内容
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href={article.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="mr-2 h-4 w-4" />
                  打开原文
                </a>
              </Button>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}


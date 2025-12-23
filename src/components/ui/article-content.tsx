"use client";

import { useMemo, createElement } from "react";
import { parseHtml } from "@/lib/parse-html";
import { ArticleImage, ArticleLinkContext } from "./article-image";

interface ArticleContentProps {
  content: string;
  articleLink?: string;
  className?: string;
}

/**
 * Custom link component that opens in new tab
 */
function ArticleLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

/**
 * Article content renderer using React component tree
 */
export function ArticleContent({
  content,
  articleLink,
  className,
}: ArticleContentProps) {
  const renderedContent = useMemo(() => {
    if (!content) return null;

    const result = parseHtml(content, {
      components: {
        img: ({ node: _, ...props }) =>
          createElement(ArticleImage, props as React.ComponentProps<typeof ArticleImage>),
        a: ({ node: _, ...props }) =>
          createElement(ArticleLink, props as React.ComponentProps<"a">),
      },
    });

    return result.toContent();
  }, [content]);

  return (
    <ArticleLinkContext.Provider value={articleLink}>
      <div className={className}>{renderedContent}</div>
    </ArticleLinkContext.Provider>
  );
}

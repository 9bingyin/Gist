import { memo, useMemo, createElement, useCallback } from "react";
import type { Root } from "hast";
import type { Components } from "hast-util-to-jsx-runtime";
import { extractImagesFromHast, parseHtml, renderHast } from "@/lib/parse-html";
import { getProxiedImageUrl } from "@/lib/image-proxy";
import { useImagePreviewStore } from "@/stores/image-preview-store";
import { ArticleLinkContext, ImagePreviewContext } from "./article-context";
import { ArticleImage } from "./article-image";

export interface ArticleContentBlock {
  key: string;
  html: string;
}

type ArticleContentProps =
  | {
      content: string;
      blocks?: never;
      articleUrl?: string;
      className?: string;
    }
  | {
      content?: never;
      blocks: ArticleContentBlock[];
      articleUrl?: string;
      className?: string;
    };

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

function ArticleTable({
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="article-table-wrapper overflow-x-auto max-w-full -webkit-overflow-scrolling-touch">
      <table {...props}>{children}</table>
    </div>
  );
}

const articleComponents: Components = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  img: ({ node: _, ...props }) =>
    createElement(
      ArticleImage,
      props as React.ComponentProps<typeof ArticleImage>,
    ),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a: ({ node: _, ...props }) =>
    createElement(ArticleLink, props as React.ComponentProps<"a">),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  table: ({ node: _, ...props }) =>
    createElement(ArticleTable, props as React.ComponentProps<"table">),
};

const ArticleHastBlockRenderer = memo(function ArticleHastBlockRenderer({
  hastTree,
}: {
  hastTree: Root;
}) {
  const renderedContent = useMemo(
    () => renderHast(hastTree, articleComponents),
    [hastTree],
  );
  return <>{renderedContent}</>;
});

/**
 * Article content renderer using React component tree.
 * Parses HTML to HAST once, extracting decoded image URLs directly from the AST.
 */
export function ArticleContent(props: ArticleContentProps) {
  const { articleUrl, className } = props;
  const blocks = "blocks" in props ? props.blocks : undefined;
  const content = "content" in props ? props.content : undefined;
  const openImagePreview = useImagePreviewStore((s) => s.open);

  const parsedBlocks = useMemo(() => {
    if (blocks) {
      return blocks.map((block) => ({
        key: block.key,
        hastTree: block.html ? parseHtml(block.html).hastTree : null,
      }));
    }
    if (content) {
      return [{ key: "single", hastTree: parseHtml(content).hastTree }];
    }
    return [];
  }, [blocks, content]);

  // Extract all images directly from parsed HAST trees (handles HTML entities like &amp;)
  const images = useMemo(() => {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const block of parsedBlocks) {
      if (!block.hastTree) continue;
      for (const src of extractImagesFromHast(block.hastTree)) {
        const proxiedSrc = getProxiedImageUrl(src, articleUrl);
        if (!seen.has(proxiedSrc)) {
          seen.add(proxiedSrc);
          result.push(proxiedSrc);
        }
      }
    }
    return result;
  }, [parsedBlocks, articleUrl]);

  const openPreview = useCallback(
    (src: string) => {
      const proxiedSrc = getProxiedImageUrl(src, articleUrl);
      const index = images.indexOf(proxiedSrc);
      if (index !== -1) {
        openImagePreview(images, index);
      } else {
        openImagePreview([proxiedSrc], 0);
      }
    },
    [articleUrl, images, openImagePreview],
  );

  const contextValue = useMemo(
    () => ({
      images,
      openPreview,
    }),
    [images, openPreview],
  );

  return (
    <ImagePreviewContext.Provider value={contextValue}>
      <ArticleLinkContext.Provider value={articleUrl}>
        <div className={className}>
          {parsedBlocks.map((block) =>
            block.hastTree ? (
              <ArticleHastBlockRenderer
                key={block.key}
                hastTree={block.hastTree}
              />
            ) : null,
          )}
        </div>
      </ArticleLinkContext.Provider>
    </ImagePreviewContext.Provider>
  );
}

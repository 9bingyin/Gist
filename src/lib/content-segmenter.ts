/**
 * HTML content segmentation utility for parallel translation
 */

export interface ContentSegment {
  index: number;
  content: string;
  type: "title" | "summary" | "content";
  isImage?: boolean; // Image segments should not be translated
}

// Block-level elements that can be used as segment boundaries
const BLOCK_ELEMENTS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "ul",
  "ol",
  "li",
  "table",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "nav",
  "figure",
  "figcaption",
  "hr",
  "br",
];

// Elements that contain images and should be skipped
const IMAGE_ELEMENTS = ["img", "figure", "picture", "video", "audio", "iframe"];

/**
 * Check if an HTML string contains only image/media elements
 */
function isImageSegment(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;

  // Check if starts with image-related tags
  const lowerHtml = trimmed.toLowerCase();

  // Direct image tag
  if (lowerHtml.startsWith("<img")) return true;

  // Figure containing image
  if (lowerHtml.startsWith("<figure")) {
    return /<img\s/i.test(trimmed);
  }

  // Picture element
  if (lowerHtml.startsWith("<picture")) return true;

  // Video/audio/iframe
  if (
    lowerHtml.startsWith("<video") ||
    lowerHtml.startsWith("<audio") ||
    lowerHtml.startsWith("<iframe")
  ) {
    return true;
  }

  return false;
}

/**
 * Check if HTML content has meaningful text to translate
 */
function hasTextContent(html: string): boolean {
  // Remove all HTML tags and check if there's remaining text
  const textOnly = html.replace(/<[^>]*>/g, "").trim();
  // At least 2 characters of actual text content
  return textOnly.length >= 2;
}

/**
 * Segment HTML content by block elements
 * Returns an array of content segments with proper indexing
 */
export function segmentHtmlContent(html: string): ContentSegment[] {
  if (!html || !html.trim()) {
    return [];
  }

  const segments: ContentSegment[] = [];

  // Build regex pattern for block elements
  // Match: <tag>...</tag> or self-closing <tag />
  const blockPattern = new RegExp(
    `(<(?:${BLOCK_ELEMENTS.join("|")})[^>]*>(?:[\\s\\S]*?)<\\/(?:${BLOCK_ELEMENTS.join("|")})>|<(?:${IMAGE_ELEMENTS.join("|")})[^>]*\\/?>|<hr[^>]*\\/?>|<br[^>]*\\/?>)`,
    "gi"
  );

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let segmentIndex = 0;

  // Find all block-level elements
  const matches: Array<{ content: string; start: number; end: number }> = [];

  while ((match = blockPattern.exec(html)) !== null) {
    matches.push({
      content: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // If no matches found, treat entire content as one segment
  if (matches.length === 0) {
    if (hasTextContent(html)) {
      segments.push({
        index: 0,
        content: html.trim(),
        type: "content",
        isImage: isImageSegment(html),
      });
    }
    return segments;
  }

  // Process matches and gaps between them
  for (const m of matches) {
    // Check for content between last match and current match
    if (m.start > lastIndex) {
      const gap = html.slice(lastIndex, m.start).trim();
      if (gap && hasTextContent(gap)) {
        segments.push({
          index: segmentIndex++,
          content: gap,
          type: "content",
          isImage: isImageSegment(gap),
        });
      }
    }

    // Add current match as segment
    const content = m.content.trim();
    if (content) {
      const isImage = isImageSegment(content);
      // Skip empty or whitespace-only text segments
      if (isImage || hasTextContent(content)) {
        segments.push({
          index: segmentIndex++,
          content,
          type: "content",
          isImage,
        });
      }
    }

    lastIndex = m.end;
  }

  // Check for remaining content after last match
  if (lastIndex < html.length) {
    const remaining = html.slice(lastIndex).trim();
    if (remaining && hasTextContent(remaining)) {
      segments.push({
        index: segmentIndex++,
        content: remaining,
        type: "content",
        isImage: isImageSegment(remaining),
      });
    }
  }

  return segments;
}

/**
 * Build complete segment list including title and summary
 */
export function buildTranslationSegments(
  title: string | null | undefined,
  summary: string | null | undefined,
  content: string
): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let index = 0;

  // Add title as first segment
  if (title && title.trim()) {
    segments.push({
      index: index++,
      content: title.trim(),
      type: "title",
      isImage: false,
    });
  }

  // Add summary as second segment
  if (summary && summary.trim()) {
    segments.push({
      index: index++,
      content: summary.trim(),
      type: "summary",
      isImage: false,
    });
  }

  // Add content segments
  const contentSegments = segmentHtmlContent(content);
  for (const seg of contentSegments) {
    segments.push({
      ...seg,
      index: index++,
    });
  }

  return segments;
}

/**
 * Reassemble translated segments back to full content
 */
export function assembleTranslatedContent(
  segments: ContentSegment[],
  translatedMap: Map<number, string>
): {
  title: string | null;
  summary: string | null;
  content: string;
} {
  let title: string | null = null;
  let summary: string | null = null;
  const contentParts: Array<{ index: number; content: string }> = [];

  for (const seg of segments) {
    const translated = translatedMap.get(seg.index) ?? seg.content;

    if (seg.type === "title") {
      title = translated;
    } else if (seg.type === "summary") {
      summary = translated;
    } else {
      contentParts.push({ index: seg.index, content: translated });
    }
  }

  // Sort content parts by index and join
  const content = contentParts
    .sort((a, b) => a.index - b.index)
    .map((p) => p.content)
    .join("\n");

  return { title, summary, content };
}

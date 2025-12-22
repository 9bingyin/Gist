/**
 * HTML content segmentation utility for parallel translation
 * Uses cheerio for proper HTML parsing to handle nested elements correctly
 */

import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export interface ContentSegment {
  index: number;
  content: string;
  type: "title" | "summary" | "content";
  isImage?: boolean; // Image segments should not be translated
}

// Top-level block elements used for segmentation
const TOP_LEVEL_BLOCKS = new Set([
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
  "table",
  "figure",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "nav",
  "hr",
]);

// Media elements that should be marked as image segments
const MEDIA_ELEMENTS = new Set(["img", "picture", "video", "audio", "iframe"]);

/**
 * Check if an element is a media-only segment (no meaningful text)
 */
function isMediaSegment(
  $el: cheerio.Cheerio<Element>,
  $: cheerio.CheerioAPI
): boolean {
  const tagName = $el.prop("tagName")?.toLowerCase();
  if (!tagName) return false;

  // Direct media element
  if (MEDIA_ELEMENTS.has(tagName)) return true;

  // Figure containing media with minimal text
  if (tagName === "figure") {
    const hasMedia =
      $el.find("img, picture, video, audio, iframe").length > 0;
    const textContent = $el.text().trim();
    // Allow figcaption with short text
    return hasMedia && textContent.length < 50;
  }

  // Paragraph containing only media
  if (tagName === "p") {
    const textContent = $el.text().trim();
    const hasMedia = $el.find("img, picture, video, audio, iframe").length > 0;
    return textContent.length === 0 && hasMedia;
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
 * Segment HTML content using cheerio for proper parsing
 * Returns an array of content segments with proper indexing
 */
export function segmentHtmlContent(html: string): ContentSegment[] {
  if (!html || !html.trim()) {
    return [];
  }

  const $ = cheerio.load(html, { xml: false });
  const segments: ContentSegment[] = [];
  let segmentIndex = 0;

  // Get children from body or root
  const children = $("body").length
    ? $("body").children().toArray()
    : $.root().children().toArray();

  // Process each top-level child
  for (const node of children) {
    if (node.type !== "tag") {
      // Handle text nodes at root level
      const textContent = $(node).text().trim();
      if (textContent.length >= 2) {
        segments.push({
          index: segmentIndex++,
          content: textContent,
          type: "content",
          isImage: false,
        });
      }
      continue;
    }

    const element = node as Element;
    const $el = $(element);
    const tagName = element.tagName.toLowerCase();
    const outerHtml = $.html($el);

    // Skip empty elements
    if (!outerHtml || !outerHtml.trim()) continue;

    // Check if it's a media segment
    const isMedia = isMediaSegment($el, $);

    // For block elements, add as segment if has content or is media
    if (TOP_LEVEL_BLOCKS.has(tagName)) {
      if (isMedia || hasTextContent(outerHtml)) {
        segments.push({
          index: segmentIndex++,
          content: outerHtml,
          type: "content",
          isImage: isMedia,
        });
      }
    } else {
      // For other elements (span, a, etc.), include if has text
      if (hasTextContent(outerHtml)) {
        segments.push({
          index: segmentIndex++,
          content: outerHtml,
          type: "content",
          isImage: false,
        });
      }
    }
  }

  // If no segments found but has content, treat entire HTML as one segment
  if (segments.length === 0 && hasTextContent(html)) {
    segments.push({
      index: 0,
      content: html.trim(),
      type: "content",
      isImage: false,
    });
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

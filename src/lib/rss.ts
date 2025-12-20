import Parser from "rss-parser";
import he from "he";
import { load } from "cheerio";
import { getUserAgent, getFallbackUserAgent } from "@/lib/settings";

export interface ParsedFeed {
  title: string;
  description?: string;
  link?: string;
  image?: string;
  items: ParsedArticle[];
}

export interface ParsedArticle {
  title: string;
  link?: string;
  content?: string;
  summary?: string;
  pubDate?: Date;
  imageUrl?: string;
}

function extractImageFromContent(content?: string): string | undefined {
  if (!content) return undefined;

  const $ = load(content);
  let imageUrl: string | undefined;

  $("img").each((_, el) => {
    if (imageUrl) return false; // Already found, stop iterating

    const $el = $(el);
    const width = parseInt($el.attr("width") || "0", 10);
    const height = parseInt($el.attr("height") || "0", 10);

    // Skip tracking pixels (small dimensions)
    if (width > 0 && height > 0 && (width <= 10 || height <= 10)) {
      return; // Continue to next image
    }

    const src = $el.attr("src");
    if (src) {
      imageUrl = src;
      return false; // Stop iterating
    }
  });

  return imageUrl;
}

/**
 * Convert relative URL to absolute URL
 */
function toAbsoluteUrl(
  url: string | undefined,
  baseUrl: string | undefined,
): string | undefined {
  if (!url) return undefined;

  // Already absolute URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Protocol-relative URL
  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  // Relative URL - need base URL
  if (!baseUrl) return undefined;

  try {
    const base = new URL(baseUrl);

    // Absolute path
    if (url.startsWith("/")) {
      return `${base.origin}${url}`;
    }

    // Relative path
    const basePath = base.pathname.substring(
      0,
      base.pathname.lastIndexOf("/") + 1,
    );
    return `${base.origin}${basePath}${url}`;
  } catch {
    return undefined;
  }
}

interface MediaContent {
  $?: {
    url?: string;
  };
}

interface ContentType {
  "acceptance-date-time"?: string[];
  "filing-date"?: string[];
}

type RssItem = {
  enclosure?: { url?: string };
  "media:content"?: MediaContent;
  content?: string;
  "content:encoded"?: string;
  title?: string;
  link?: string;
  contentSnippet?: string;
  summary?: string;
  pubDate?: string;
  isoDate?: string; // rss-parser converts Atom's updated/published to isoDate
  contentType?: ContentType; // SEC EDGAR custom field
};

async function fetchFeedWithUA(url: string, userAgent: string) {
  const parser = new Parser({
    timeout: 10000,
    headers: {
      "User-Agent": userAgent,
    },
    customFields: {
      item: [["content-type", "contentType", { keepArray: false }]],
    },
  });
  return parser.parseURL(url);
}

export async function parseFeed(url: string): Promise<ParsedFeed> {
  const userAgent = await getUserAgent();

  let feed;
  try {
    feed = await fetchFeedWithUA(url, userAgent);
  } catch (error) {
    // If failed with 403/blocked, try fallback UA
    const fallbackUA = await getFallbackUserAgent();
    if (fallbackUA && error instanceof Error && error.message.includes("403")) {
      console.log(`Retrying ${url} with fallback UA`);
      feed = await fetchFeedWithUA(url, fallbackUA);
    } else {
      throw error;
    }
  }

  const items: ParsedArticle[] = (feed.items || []).map((item) => {
    const rssItem = item as RssItem;
    const link = rssItem.link?.trim() || undefined;
    const rawImageUrl =
      rssItem.enclosure?.url ||
      rssItem["media:content"]?.$?.url ||
      extractImageFromContent(rssItem.content || rssItem["content:encoded"]);

    // Convert relative URL to absolute URL using article link as base
    const imageUrl = toAbsoluteUrl(rawImageUrl, link || feed.link);

    // For Atom feeds, HTML content might be in summary field instead of content
    // Also decode HTML entities that may be double-encoded in Atom feeds
    let htmlContent =
      rssItem["content:encoded"] || rssItem.content || rssItem.summary;
    if (htmlContent) {
      // Decode HTML entities (e.g., &lt;p&gt; -> <p>)
      htmlContent = he.decode(htmlContent);
    }

    // Parse date from multiple possible fields
    // Priority: SEC's acceptance-date-time > filing-date > standard pubDate > isoDate
    let dateStr: string | undefined;
    if (rssItem.contentType?.["acceptance-date-time"]?.[0]) {
      dateStr = rssItem.contentType["acceptance-date-time"][0];
    } else if (rssItem.contentType?.["filing-date"]?.[0]) {
      dateStr = rssItem.contentType["filing-date"][0];
    } else {
      dateStr = rssItem.pubDate || rssItem.isoDate;
    }

    let pubDate: Date | undefined;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        pubDate = parsed;
      }
    }

    return {
      title: rssItem.title || "Untitled",
      link,
      content: htmlContent,
      summary: rssItem.contentSnippet,
      pubDate,
      imageUrl,
    };
  });

  return {
    title: feed.title || "Unknown Feed",
    description: feed.description,
    link: feed.link,
    image: feed.image?.url,
    items,
  };
}

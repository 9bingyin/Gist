import Parser from "rss-parser";
import he from "he";
import { getUserAgent } from "@/lib/settings";

export interface ParsedFeed {
  title: string;
  description?: string;
  link?: string;
  image?: string;
  items: ParsedArticle[];
}

export interface ParsedArticle {
  title: string;
  link: string;
  content?: string;
  summary?: string;
  pubDate?: Date;
  imageUrl?: string;
}

function extractImageFromContent(content?: string): string | undefined {
  if (!content) return undefined;
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch?.[1];
}

interface MediaContent {
  $?: {
    url?: string;
  };
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
};

export async function parseFeed(url: string): Promise<ParsedFeed> {
  const userAgent = await getUserAgent();
  const parser = new Parser({
    timeout: 10000,
    headers: {
      "User-Agent": userAgent,
    },
  });

  const feed = await parser.parseURL(url);

  const items: ParsedArticle[] = (feed.items || []).map((item) => {
    const rssItem = item as RssItem;
    const imageUrl =
      rssItem.enclosure?.url ||
      rssItem["media:content"]?.$?.url ||
      extractImageFromContent(rssItem.content || rssItem["content:encoded"]);

    // For Atom feeds, HTML content might be in summary field instead of content
    // Also decode HTML entities that may be double-encoded in Atom feeds
    let htmlContent = rssItem["content:encoded"] || rssItem.content || rssItem.summary;
    if (htmlContent) {
      // Decode HTML entities (e.g., &lt;p&gt; -> <p>)
      htmlContent = he.decode(htmlContent);
    }

    return {
      title: rssItem.title || "Untitled",
      link: rssItem.link || "",
      content: htmlContent,
      summary: rssItem.contentSnippet,
      pubDate: rssItem.pubDate ? new Date(rssItem.pubDate) : undefined,
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

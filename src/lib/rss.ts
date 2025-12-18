import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "RSS Reader/1.0",
  },
});

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

export async function parseFeed(url: string): Promise<ParsedFeed> {
  const feed = await parser.parseURL(url);

  const items: ParsedArticle[] = (feed.items || []).map((item) => {
    const imageUrl =
      item.enclosure?.url ||
      (item as Record<string, unknown>)["media:content"]?.["$"]?.url ||
      extractImageFromContent(item.content || item["content:encoded"]);

    return {
      title: item.title || "Untitled",
      link: item.link || "",
      content: item["content:encoded"] || item.content,
      summary: item.contentSnippet || item.summary,
      pubDate: item.pubDate ? new Date(item.pubDate) : undefined,
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFeed } from "@/lib/rss";
import { getFavicon } from "@/lib/favicon";

// Export OPML
export async function GET() {
  const feeds = await prisma.feed.findMany({
    include: {
      folder: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const folders = await prisma.folder.findMany({
    orderBy: { createdAt: "asc" },
  });

  const folderMap = new Map<string, typeof feeds>();
  const uncategorized: typeof feeds = [];

  for (const feed of feeds) {
    if (feed.folderId) {
      const existing = folderMap.get(feed.folderId) || [];
      existing.push(feed);
      folderMap.set(feed.folderId, existing);
    } else {
      uncategorized.push(feed);
    }
  }

  let opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>RSS Reader Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
`;

  // Add folders with their feeds
  for (const folder of folders) {
    const folderFeeds = folderMap.get(folder.id) || [];
    opml += `    <outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">\n`;
    for (const feed of folderFeeds) {
      opml += `      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"${feed.siteUrl ? ` htmlUrl="${escapeXml(feed.siteUrl)}"` : ""}/>\n`;
    }
    opml += `    </outline>\n`;
  }

  // Add uncategorized feeds
  for (const feed of uncategorized) {
    opml += `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"${feed.siteUrl ? ` htmlUrl="${escapeXml(feed.siteUrl)}"` : ""}/>\n`;
  }

  opml += `  </body>
</opml>`;

  return new NextResponse(opml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="rss-subscriptions-${new Date().toISOString().split("T")[0]}.opml"`,
    },
  });
}

// Import OPML
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.text();
    const parsed = parseOpml(content);

    let imported = 0;
    let skipped = 0;

    for (const item of parsed) {
      // Create folder if needed
      let folderId: string | null = null;
      if (item.folder) {
        const existingFolder = await prisma.folder.findFirst({
          where: { name: item.folder },
        });
        if (existingFolder) {
          folderId = existingFolder.id;
        } else {
          const newFolder = await prisma.folder.create({
            data: { name: item.folder },
          });
          folderId = newFolder.id;
        }
      }

      // Check if feed already exists
      const existingFeed = await prisma.feed.findUnique({
        where: { url: item.xmlUrl },
      });

      if (existingFeed) {
        // Update folder if needed
        if (folderId && existingFeed.folderId !== folderId) {
          await prisma.feed.update({
            where: { id: existingFeed.id },
            data: { folderId },
          });
        }
        skipped++;
        continue;
      }

      // Try to parse and add the feed
      try {
        const feedData = await parseFeed(item.xmlUrl);
        let imageUrl = feedData.image;
        if (!imageUrl && feedData.link) {
          imageUrl = (await getFavicon(feedData.link)) ?? undefined;
        }

        await prisma.feed.create({
          data: {
            title: feedData.title || item.title || item.xmlUrl,
            url: item.xmlUrl,
            siteUrl: feedData.link || item.htmlUrl,
            description: feedData.description,
            imageUrl,
            folderId,
            articles: {
              create: feedData.items.slice(0, 30).map((article) => ({
                title: article.title,
                link: article.link,
                content: article.content,
                summary: article.summary,
                imageUrl: article.imageUrl,
                pubDate: article.pubDate,
              })),
            },
          },
        });
        imported++;
      } catch {
        // If parsing fails, create a placeholder feed
        await prisma.feed.create({
          data: {
            title: item.title || item.xmlUrl,
            url: item.xmlUrl,
            siteUrl: item.htmlUrl,
            folderId,
          },
        });
        imported++;
      }
    }

    return NextResponse.json({ imported, skipped });
  } catch (error) {
    console.error("Failed to import OPML:", error);
    return NextResponse.json(
      { error: "Failed to parse OPML file" },
      { status: 400 }
    );
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface OpmlItem {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  folder?: string;
}

function parseOpml(content: string): OpmlItem[] {
  const items: OpmlItem[] = [];

  // Parse all outline opening tags with their attributes
  const outlineTagRegex = /<outline\s+([^>]*?)\s*\/?>/gi;
  const closingTagRegex = /<\/outline>/gi;

  // Track folder context using a stack
  const folderStack: string[] = [];

  // Find all tags and their positions
  interface TagInfo {
    type: "open" | "close";
    index: number;
    attrs?: Record<string, string>;
    isSelfClosing?: boolean;
  }

  const tags: TagInfo[] = [];

  // Find opening tags
  let match;
  while ((match = outlineTagRegex.exec(content)) !== null) {
    const attrs: Record<string, string> = {};
    let attrMatch;
    const attrRegexLocal = /(\w+)="([^"]*)"/g;

    while ((attrMatch = attrRegexLocal.exec(match[1])) !== null) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2];
    }

    const isSelfClosing = match[0].endsWith("/>");

    tags.push({
      type: "open",
      index: match.index,
      attrs,
      isSelfClosing,
    });
  }

  // Find closing tags
  while ((match = closingTagRegex.exec(content)) !== null) {
    tags.push({
      type: "close",
      index: match.index,
    });
  }

  // Sort tags by position
  tags.sort((a, b) => a.index - b.index);

  // Process tags in order
  for (const tag of tags) {
    if (tag.type === "close") {
      // Pop folder from stack
      folderStack.pop();
    } else if (tag.attrs) {
      const attrs = tag.attrs;

      if (attrs.xmlurl) {
        // This is a feed
        items.push({
          title: attrs.title || attrs.text || attrs.xmlurl,
          xmlUrl: attrs.xmlurl,
          htmlUrl: attrs.htmlurl,
          folder: folderStack.length > 0 ? folderStack[folderStack.length - 1] : undefined,
        });
      } else if ((attrs.text || attrs.title) && !tag.isSelfClosing) {
        // This is a folder (has text/title but no xmlUrl and is not self-closing)
        folderStack.push(attrs.text || attrs.title);
      }
    }
  }

  return items;
}

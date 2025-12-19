import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateOpml } from "feedsmith";

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

  const outlines: Array<{
    text: string;
    title?: string;
    type?: string;
    xmlUrl?: string;
    htmlUrl?: string;
    outlines?: Array<{
      text: string;
      title: string;
      type: string;
      xmlUrl: string;
      htmlUrl?: string;
    }>;
  }> = [];

  for (const folder of folders) {
    const folderFeeds = folderMap.get(folder.id) || [];
    outlines.push({
      text: folder.name,
      title: folder.name,
      outlines: folderFeeds.map((feed) => ({
        text: feed.title,
        title: feed.title,
        type: "rss",
        xmlUrl: feed.url,
        htmlUrl: feed.siteUrl || undefined,
      })),
    });
  }

  for (const feed of uncategorized) {
    outlines.push({
      text: feed.title,
      title: feed.title,
      type: "rss",
      xmlUrl: feed.url,
      htmlUrl: feed.siteUrl || undefined,
    });
  }

  const opml = generateOpml({
    head: {
      title: "RSS Reader Subscriptions",
      dateCreated: new Date(),
    },
    body: {
      outlines,
    },
  });

  return new NextResponse(opml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="rss-subscriptions-${new Date().toISOString().split("T")[0]}.opml"`,
    },
  });
}

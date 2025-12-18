import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFeed } from "@/lib/rss";
import { getFavicon } from "@/lib/favicon";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const feed = await prisma.feed.findUnique({ where: { id } });
  if (!feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 });
  }

  try {
    const parsed = await parseFeed(feed.url);

    // Update feed icon if missing
    if (!feed.imageUrl && parsed.link) {
      const favicon = await getFavicon(parsed.link);
      if (favicon) {
        await prisma.feed.update({
          where: { id },
          data: { imageUrl: favicon },
        });
      }
    }

    for (const item of parsed.items) {
      await prisma.article.upsert({
        where: { link: item.link },
        update: {},
        create: {
          title: item.title,
          link: item.link,
          content: item.content,
          summary: item.summary,
          imageUrl: item.imageUrl,
          pubDate: item.pubDate,
          feedId: id,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to refresh feed:", error);
    return NextResponse.json(
      { error: "Failed to refresh feed" },
      { status: 500 }
    );
  }
}

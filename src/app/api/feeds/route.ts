import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFeed } from "@/lib/rss";
import { getFavicon } from "@/lib/favicon";

export async function GET() {
  const feeds = await prisma.feed.findMany({
    include: {
      _count: {
        select: { articles: { where: { isRead: false } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(feeds);
}

export async function POST(request: NextRequest) {
  const { url } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const existingFeed = await prisma.feed.findUnique({ where: { url } });
  if (existingFeed) {
    return NextResponse.json({ error: "Feed already exists" }, { status: 409 });
  }

  try {
    const parsed = await parseFeed(url);

    // Get favicon if RSS feed doesn't have an image
    let imageUrl = parsed.image;
    if (!imageUrl && parsed.link) {
      imageUrl = await getFavicon(parsed.link) ?? undefined;
    }

    const feed = await prisma.feed.create({
      data: {
        title: parsed.title,
        url,
        siteUrl: parsed.link,
        description: parsed.description,
        imageUrl,
        articles: {
          create: parsed.items.slice(0, 50).map((item) => ({
            title: item.title,
            link: item.link,
            content: item.content,
            summary: item.summary,
            imageUrl: item.imageUrl,
            pubDate: item.pubDate,
          })),
        },
      },
      include: {
        _count: {
          select: { articles: { where: { isRead: false } } },
        },
      },
    });

    return NextResponse.json(feed, { status: 201 });
  } catch (error) {
    console.error("Failed to parse feed:", error);
    return NextResponse.json(
      { error: "Failed to parse RSS feed" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  await prisma.feed.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

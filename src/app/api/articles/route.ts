import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const feedId = searchParams.get("feedId");
  const folderId = searchParams.get("folderId");
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  const where: any = {};
  if (feedId) {
    where.feedId = feedId;
  }
  if (folderId) {
    where.feed = {
      folderId: folderId,
    };
  }
  if (unreadOnly) {
    where.isRead = false;
  }

  const articles = await prisma.article.findMany({
    where,
    include: {
      feed: {
        select: { id: true, title: true, imageUrl: true },
      },
    },
    orderBy: { pubDate: "desc" },
    take: 100,
  });

  return NextResponse.json(articles);
}

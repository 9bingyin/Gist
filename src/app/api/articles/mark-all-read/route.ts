import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { feedId, folderId, articleIds } = await request.json();

  // Build where clause with priority: articleIds > feedId > folderId > all
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma where type is complex
  const where: any = { isRead: false };

  if (articleIds && articleIds.length > 0) {
    // Precise: mark specific articles (safest option)
    where.id = { in: articleIds };
  } else if (feedId) {
    // Mark all unread in specific feed
    where.feedId = feedId;
  } else if (folderId) {
    // Mark all unread in feeds belonging to folder
    where.feed = { folderId };
  }
  // If none specified, marks all unread articles

  const result = await prisma.article.updateMany({
    where,
    data: { isRead: true },
  });

  return NextResponse.json({ count: result.count });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { feedId, folderId, type } = await request.json();

  // Build where clause: feedId > folderId > type > all
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma where type is complex
  const where: any = { isRead: false };

  if (feedId) {
    // Mark all unread in specific feed
    where.feedId = feedId;
  } else if (folderId) {
    // Mark all unread in feeds belonging to folder
    where.feed = { folderId };
  } else if (type) {
    // Mark all unread in feeds of specific type
    where.feed = { type };
  }
  // If none specified, marks all unread articles

  const result = await prisma.article.updateMany({
    where,
    data: { isRead: true },
  });

  return NextResponse.json({ count: result.count });
}

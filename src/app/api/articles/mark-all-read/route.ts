import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { feedId } = await request.json();

  const where = feedId ? { feedId, isRead: false } : { isRead: false };

  const result = await prisma.article.updateMany({
    where,
    data: { isRead: true },
  });

  return NextResponse.json({ count: result.count });
}

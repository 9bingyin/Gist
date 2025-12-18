import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { olderThanDays, readOnly } = await request.json();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (olderThanDays || 30));

  const where: {
    createdAt: { lt: Date };
    isRead?: boolean;
  } = {
    createdAt: { lt: cutoffDate },
  };

  if (readOnly) {
    where.isRead = true;
  }

  const result = await prisma.article.deleteMany({ where });

  return NextResponse.json({ count: result.count });
}

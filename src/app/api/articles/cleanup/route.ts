import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const rawDays = body.olderThanDays;
  const parsedDays =
    rawDays === undefined ? 30 : Number.parseFloat(String(rawDays));

  if (!Number.isFinite(parsedDays) || parsedDays < 0) {
    return NextResponse.json(
      { error: "olderThanDays must be a non-negative number" },
      { status: 400 },
    );
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - parsedDays);

  const where: {
    createdAt: { lt: Date };
    isRead?: boolean;
  } = {
    createdAt: { lt: cutoffDate },
  };

  if (body.readOnly === true) {
    where.isRead = true;
  }

  const result = await prisma.article.deleteMany({ where });

  return NextResponse.json({ count: result.count });
}

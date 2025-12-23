import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // Build update data
  const updateData: { isRead?: boolean; isStarred?: boolean } = {};

  if (typeof body.isRead === "boolean") {
    updateData.isRead = body.isRead;
  }

  if (typeof body.isStarred === "boolean") {
    updateData.isStarred = body.isStarred;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "At least one of isRead or isStarred must be provided" },
      { status: 400 },
    );
  }

  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const article = await prisma.article.update({
    where: { id },
    data: updateData,
    include: {
      feed: {
        select: { id: true, title: true, imageUrl: true },
      },
    },
  });

  return NextResponse.json(article);
}

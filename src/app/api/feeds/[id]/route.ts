import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const feed = await prisma.feed.findUnique({ where: { id } });
  if (!feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 });
  }

  const updateData: { folderId?: string | null } = {};

  if ("folderId" in body) {
    updateData.folderId = body.folderId;
  }

  const updatedFeed = await prisma.feed.update({
    where: { id },
    data: updateData,
    include: {
      _count: {
        select: { articles: { where: { isRead: false } } },
      },
    },
  });

  return NextResponse.json(updatedFeed);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const feed = await prisma.feed.findUnique({ where: { id } });
  if (!feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 });
  }

  const updateData: { folderId?: string | null; type?: string } = {};

  const hasFolderId = Object.prototype.hasOwnProperty.call(body, "folderId");
  const hasType = Object.prototype.hasOwnProperty.call(body, "type");

  if (
    hasFolderId &&
    body.folderId !== null &&
    typeof body.folderId !== "string"
  ) {
    return NextResponse.json({ error: "Invalid folderId" }, { status: 400 });
  }

  let requestedType: string | undefined;
  if (hasType) {
    if (typeof body.type !== "string") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    requestedType = body.type;
  }

  const isTypeChange = hasType && requestedType !== feed.type;

  if (isTypeChange) {
    updateData.type = requestedType;
    updateData.folderId = null;
  } else {
    if (hasFolderId) {
      updateData.folderId = (body.folderId as string | null) ?? null;
      if (updateData.folderId) {
        const folder = await prisma.folder.findUnique({
          where: { id: updateData.folderId },
          select: { type: true },
        });
        if (!folder) {
          return NextResponse.json(
            { error: "Folder not found" },
            { status: 404 },
          );
        }
        updateData.type = folder.type;
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
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

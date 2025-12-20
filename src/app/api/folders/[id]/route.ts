import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const existing = await prisma.folder.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const updateData: { name?: string; type?: string } = {};

  if (body.name && typeof body.name === "string" && body.name.trim() !== "") {
    updateData.name = body.name.trim();
  }

  if (body.type && typeof body.type === "string") {
    updateData.type = body.type;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  // If type is being updated, also update all feeds in this folder
  if (updateData.type) {
    const [folder] = await prisma.$transaction([
      prisma.folder.update({
        where: { id },
        data: updateData,
        include: {
          _count: {
            select: { feeds: true },
          },
        },
      }),
      prisma.feed.updateMany({
        where: { folderId: id },
        data: { type: updateData.type },
      }),
    ]);
    return NextResponse.json(folder);
  }

  const folder = await prisma.folder.update({
    where: { id },
    data: updateData,
    include: {
      _count: {
        select: { feeds: true },
      },
    },
  });

  return NextResponse.json(folder);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const existing = await prisma.folder.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  await prisma.folder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

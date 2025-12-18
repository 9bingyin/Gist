import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name } = await request.json();

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const folder = await prisma.folder.update({
    where: { id },
    data: { name: name.trim() },
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.folder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

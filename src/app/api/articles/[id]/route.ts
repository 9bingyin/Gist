import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.isRead !== "boolean") {
    return NextResponse.json(
      { error: "isRead must be a boolean" },
      { status: 400 },
    );
  }

  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const article = await prisma.article.update({
    where: { id },
    data: { isRead: body.isRead },
  });

  return NextResponse.json(article);
}

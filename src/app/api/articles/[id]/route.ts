import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const article = await prisma.article.update({
    where: { id },
    data: { isRead: body.isRead },
  });

  return NextResponse.json(article);
}

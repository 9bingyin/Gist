import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const folders = await prisma.folder.findMany({
    include: {
      _count: {
        select: { feeds: true },
      },
      feeds: {
        include: {
          _count: {
            select: { articles: { where: { isRead: false } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Calculate unread count for each folder
  const foldersWithUnread = folders.map((folder) => ({
    ...folder,
    unreadCount: folder.feeds.reduce(
      (sum, feed) => sum + feed._count.articles,
      0,
    ),
  }));

  return NextResponse.json(foldersWithUnread);
}

export async function POST(request: NextRequest) {
  const { name, type = "article" } = await request.json();

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const folder = await prisma.folder.create({
    data: {
      name: name.trim(),
      type,
    },
    include: {
      _count: {
        select: { feeds: true },
      },
    },
  });

  return NextResponse.json({ ...folder, unreadCount: 0 }, { status: 201 });
}

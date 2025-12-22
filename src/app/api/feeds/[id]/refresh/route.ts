import { NextRequest, NextResponse } from "next/server";
import { refreshFeed } from "@/lib/feed-refresh";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await refreshFeed(id);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to refresh feed" },
      { status: result.error === "Feed not found" ? 404 : 500 },
    );
  }

  return NextResponse.json({
    success: true,
    new: result.newCount,
    updated: result.updatedCount,
    total: result.total,
  });
}

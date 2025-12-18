import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const type = body.type || "all"; // "readability", "content", "all"

    let readabilityCleared = 0;
    let contentCleared = 0;

    if (type === "readability" || type === "all") {
      const result = await prisma.article.updateMany({
        where: {
          readabilityContent: {
            not: null,
          },
        },
        data: {
          readabilityContent: null,
        },
      });
      readabilityCleared = result.count;
    }

    if (type === "content" || type === "all") {
      const result = await prisma.article.updateMany({
        where: {
          content: {
            not: null,
          },
        },
        data: {
          content: null,
        },
      });
      contentCleared = result.count;
    }

    return NextResponse.json({
      success: true,
      readabilityCleared,
      contentCleared,
    });
  } catch (error) {
    console.error("Failed to clear cache:", error);
    return NextResponse.json(
      { error: "Failed to clear cache" },
      { status: 500 }
    );
  }
}

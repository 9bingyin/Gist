import { NextRequest, NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { prisma } from "@/lib/db";
import { getUserAgent } from "@/lib/settings";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const article = await prisma.article.findUnique({
    where: { id },
  });

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // If already cached, return cached content
  if (article.readabilityContent) {
    return NextResponse.json({
      content: article.readabilityContent,
      cached: true,
    });
  }

  try {
    const userAgent = await getUserAgent();
    const response = await fetch(article.link, {
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch article: ${response.status}` },
        { status: 500 },
      );
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url: article.link });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();

    if (!parsed) {
      return NextResponse.json(
        { error: "Failed to parse article content" },
        { status: 500 },
      );
    }

    // Cache readability content in database
    await prisma.article.update({
      where: { id },
      data: {
        readabilityContent: parsed.content,
      },
    });

    return NextResponse.json({
      content: parsed.content,
      cached: false,
    });
  } catch (error) {
    console.error("Readability error:", error);
    return NextResponse.json(
      { error: "Failed to process article" },
      { status: 500 },
    );
  }
}

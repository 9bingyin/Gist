import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFeed } from "@/lib/rss";
import { getFavicon } from "@/lib/favicon";
import { iconFileExists } from "@/lib/icon-storage";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const feed = await prisma.feed.findUnique({ where: { id } });
  if (!feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 });
  }

  try {
    const parsed = await parseFeed(feed.url);

    // Update feed info
    const updateData: { imageUrl?: string; title?: string; siteUrl?: string } =
      {};

    // Check if icon needs to be fetched (missing or file doesn't exist)
    if (parsed.link) {
      const needsFavicon =
        !feed.imageUrl || !(await iconFileExists(feed.imageUrl));
      if (needsFavicon) {
        const favicon = await getFavicon(parsed.link);
        if (favicon) {
          updateData.imageUrl = favicon;
        }
      }
    }

    // Update title if it was a placeholder
    if (feed.title === feed.url || feed.title.includes("not yet whitelisted")) {
      updateData.title = parsed.title;
    }

    // Update site URL if missing
    if (!feed.siteUrl && parsed.link) {
      updateData.siteUrl = parsed.link;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.feed.update({
        where: { id },
        data: updateData,
      });
    }

    let newCount = 0;
    let updatedCount = 0;

    for (const item of parsed.items) {
      if (!item.link) continue;

      const existing = await prisma.article.findUnique({
        where: { link: item.link },
      });

      if (existing) {
        // Update existing article if content, pubDate, or imageUrl changed
        const contentChanged =
          item.content &&
          (!existing.content || item.content !== existing.content);
        const pubDateChanged =
          item.pubDate &&
          (!existing.pubDate ||
            new Date(item.pubDate).getTime() !==
              new Date(existing.pubDate).getTime());
        const imageUrlChanged = (item.imageUrl ?? null) !== existing.imageUrl;

        if (contentChanged || pubDateChanged || imageUrlChanged) {
          await prisma.article.update({
            where: { link: item.link },
            data: {
              title: item.title,
              content: item.content,
              summary: item.summary,
              imageUrl: item.imageUrl ?? null,
              pubDate: item.pubDate,
            },
          });
          updatedCount++;
        }
      } else {
        // Create new article
        await prisma.article.create({
          data: {
            title: item.title,
            link: item.link,
            content: item.content,
            summary: item.summary,
            imageUrl: item.imageUrl,
            pubDate: item.pubDate,
            feedId: id,
          },
        });
        newCount++;
      }
    }

    console.log(
      `Refreshed feed ${feed.title}: ${newCount} new, ${updatedCount} updated`,
    );

    return NextResponse.json({
      success: true,
      new: newCount,
      updated: updatedCount,
      total: parsed.items.length,
    });
  } catch (error) {
    console.error(`Failed to refresh feed ${feed.title}:`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to refresh feed",
      },
      { status: 500 },
    );
  }
}

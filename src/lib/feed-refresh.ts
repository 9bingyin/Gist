/**
 * Shared feed refresh logic with batch DB operations
 */

import { prisma } from "@/lib/db";
import { parseFeed, type ParsedArticle } from "@/lib/rss";
import { getFavicon } from "@/lib/favicon";
import { iconFileExists } from "@/lib/icon-storage";

// Lock to prevent concurrent refresh of the same feed
const refreshingFeeds = new Set<string>();

export interface RefreshResult {
  success: boolean;
  newCount: number;
  updatedCount: number;
  total: number;
  error?: string;
}

interface ExistingArticle {
  id: string;
  link: string;
  content: string | null;
  pubDate: Date | null;
  imageUrl: string | null;
}

/**
 * Check if an article needs to be updated
 */
function needsUpdate(existing: ExistingArticle, item: ParsedArticle): boolean {
  const contentChanged =
    item.content && (!existing.content || item.content !== existing.content);

  const pubDateChanged =
    item.pubDate &&
    (!existing.pubDate ||
      new Date(item.pubDate).getTime() !== new Date(existing.pubDate).getTime());

  const imageUrlChanged = (item.imageUrl ?? null) !== existing.imageUrl;

  return !!(contentChanged || pubDateChanged || imageUrlChanged);
}

/**
 * Refresh a single feed with optimized batch DB operations
 */
export async function refreshFeed(feedId: string): Promise<RefreshResult> {
  // Check if this feed is already being refreshed
  if (refreshingFeeds.has(feedId)) {
    return { success: false, newCount: 0, updatedCount: 0, total: 0, error: "Feed is already being refreshed" };
  }

  // Acquire lock
  refreshingFeeds.add(feedId);

  try {
    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (!feed) {
      return { success: false, newCount: 0, updatedCount: 0, total: 0, error: "Feed not found" };
    }

    const parsed = await parseFeed(feed.url);

    // Update feed info
    const updateData: { imageUrl?: string; title?: string; siteUrl?: string } = {};

    if (parsed.link) {
      const needsFavicon = !feed.imageUrl || !(await iconFileExists(feed.imageUrl));
      if (needsFavicon) {
        const favicon = await getFavicon(parsed.link);
        if (favicon) {
          updateData.imageUrl = favicon;
        }
      }
    }

    if (feed.title === feed.url || feed.title.includes("not yet whitelisted")) {
      updateData.title = parsed.title;
    }

    if (!feed.siteUrl && parsed.link) {
      updateData.siteUrl = parsed.link;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.feed.update({
        where: { id: feedId },
        data: updateData,
      });
    }

    // Batch query existing articles
    const existingArticles = await prisma.article.findMany({
      where: { feedId },
      select: { id: true, link: true, content: true, pubDate: true, imageUrl: true },
    });
    const existingMap = new Map(existingArticles.map((a) => [a.link, a]));

    // Classify articles: new vs needs update
    const newArticles: {
      title: string;
      link: string;
      content: string | null | undefined;
      summary: string | null | undefined;
      imageUrl: string | null | undefined;
      pubDate: Date | null | undefined;
      feedId: string;
    }[] = [];
    const updatePromises: Promise<unknown>[] = [];

    for (const item of parsed.items) {
      const link = item.link?.trim();
      if (!link) continue;

      const existing = existingMap.get(link);
      if (existing) {
        if (needsUpdate(existing, item)) {
          updatePromises.push(
            prisma.article.update({
              where: { id: existing.id },
              data: {
                title: item.title,
                content: item.content,
                summary: item.summary,
                imageUrl: item.imageUrl ?? null,
                pubDate: item.pubDate,
              },
            })
          );
        }
      } else {
        newArticles.push({
          title: item.title,
          link,
          content: item.content,
          summary: item.summary,
          imageUrl: item.imageUrl,
          pubDate: item.pubDate,
          feedId,
        });
      }
    }

    // Batch create new articles
    if (newArticles.length > 0) {
      await prisma.article.createMany({
        data: newArticles,
      });
    }

    // Parallel execute updates
    await Promise.all(updatePromises);

    const newCount = newArticles.length;
    const updatedCount = updatePromises.length;

    if (newCount > 0 || updatedCount > 0) {
      console.log(`Refreshed feed ${feed.title}: ${newCount} new, ${updatedCount} updated`);
    }

    return {
      success: true,
      newCount,
      updatedCount,
      total: parsed.items.length,
    };
  } catch (error) {
    console.error(`Failed to refresh feed ${feedId}:`, error);
    return {
      success: false,
      newCount: 0,
      updatedCount: 0,
      total: 0,
      error: error instanceof Error ? error.message : "Failed to refresh feed",
    };
  } finally {
    // Release lock
    refreshingFeeds.delete(feedId);
  }
}

/**
 * Refresh multiple feeds with concurrency control
 */
export async function refreshFeedsWithConcurrency(
  feedIds: string[],
  concurrency: number = 5,
  onProgress?: (completed: number, total: number, feedTitle?: string) => void
): Promise<{ success: number; failed: number }> {
  let successCount = 0;
  let failedCount = 0;
  let completed = 0;

  // Get feed titles for logging
  const feeds = await prisma.feed.findMany({
    where: { id: { in: feedIds } },
    select: { id: true, title: true },
  });
  const feedTitleMap = new Map(feeds.map((f) => [f.id, f.title]));

  // Process in batches
  for (let i = 0; i < feedIds.length; i += concurrency) {
    const batch = feedIds.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (feedId) => {
        const result = await refreshFeed(feedId);
        completed++;
        onProgress?.(completed, feedIds.length, feedTitleMap.get(feedId));
        return result;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }
  }

  return { success: successCount, failed: failedCount };
}

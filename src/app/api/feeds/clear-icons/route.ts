import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFavicon } from "@/lib/favicon";
import { deleteAllIconFiles } from "@/lib/icon-storage";

// Concurrent download limit
const CONCURRENT_DOWNLOADS = 10;

/**
 * Process items in batches with concurrency limit
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((item) => processor(item)),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }

  return results;
}

export async function POST() {
  try {
    const startTime = Date.now();

    // Delete all icon files from storage
    const deletedFiles = await deleteAllIconFiles();
    console.log(`Deleted ${deletedFiles} icon files from storage`);

    // Clear all feed icons in database (including old URL format)
    await prisma.feed.updateMany({
      data: {
        imageUrl: null,
      },
    });

    // Re-fetch all feed icons
    const feeds = await prisma.feed.findMany({
      select: { id: true, siteUrl: true },
    });

    // Group feeds by hostname to avoid duplicate downloads
    const feedsByHostname = new Map<string, string[]>();
    const feedsWithoutSiteUrl: string[] = [];

    for (const feed of feeds) {
      if (feed.siteUrl) {
        try {
          const url = new URL(feed.siteUrl);
          const hostname = url.hostname;
          if (!feedsByHostname.has(hostname)) {
            feedsByHostname.set(hostname, []);
          }
          feedsByHostname.get(hostname)!.push(feed.id);
        } catch {
          feedsWithoutSiteUrl.push(feed.id);
        }
      } else {
        feedsWithoutSiteUrl.push(feed.id);
      }
    }

    console.log(
      `Starting to fetch icons for ${feedsByHostname.size} unique domains with ${CONCURRENT_DOWNLOADS} concurrent downloads...`,
    );

    // Convert to array for batch processing
    const hostnameEntries = Array.from(feedsByHostname.entries());

    // Process downloads concurrently
    const results = await processBatch(
      hostnameEntries,
      async ([hostname, feedIds]) => {
        try {
          const siteUrl = `https://${hostname}`;
          const iconFilename = await getFavicon(siteUrl);

          if (iconFilename) {
            return { hostname, feedIds, iconFilename, success: true };
          } else {
            return { hostname, feedIds, iconFilename: null, success: false };
          }
        } catch (error) {
          console.error(`Error fetching icon for ${hostname}:`, error);
          return { hostname, feedIds, iconFilename: null, success: false };
        }
      },
      CONCURRENT_DOWNLOADS,
    );

    // Batch update database
    console.log("Updating database...");
    let successCount = 0;
    let failCount = 0;

    const updatePromises = results.map(async (result) => {
      if (result.success && result.iconFilename) {
        await prisma.feed.updateMany({
          where: { id: { in: result.feedIds } },
          data: { imageUrl: result.iconFilename },
        });
        console.log(`✓ ${result.hostname} (${result.feedIds.length} feeds)`);
        return result.feedIds.length;
      } else {
        console.log(`✗ ${result.hostname} (${result.feedIds.length} feeds)`);
        return -result.feedIds.length;
      }
    });

    const updateResults = await Promise.all(updatePromises);

    for (const count of updateResults) {
      if (count > 0) {
        successCount += count;
      } else {
        failCount += Math.abs(count);
      }
    }

    failCount += feedsWithoutSiteUrl.length;
    if (feedsWithoutSiteUrl.length > 0) {
      console.log(`${feedsWithoutSiteUrl.length} feeds have no siteUrl`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `Icon refresh complete in ${duration}s: ${successCount} succeeded, ${failCount} failed`,
    );

    return NextResponse.json({
      success: true,
      total: feeds.length,
      uniqueDomains: feedsByHostname.size,
      successCount,
      failCount,
      deletedFiles,
      duration: `${duration}s`,
    });
  } catch (error) {
    console.error("Clear icons error:", error);
    return NextResponse.json(
      { error: "Failed to clear icons" },
      { status: 500 },
    );
  }
}

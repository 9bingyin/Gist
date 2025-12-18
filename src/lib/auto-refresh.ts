import { prisma } from "@/lib/db";
import { parseFeed } from "@/lib/rss";
import { getFavicon } from "@/lib/favicon";
import { getRefreshInterval } from "@/lib/settings";

const globalForAutoRefresh = globalThis as unknown as {
  autoRefreshInterval: ReturnType<typeof setInterval> | null;
  lastRefreshInterval: number;
};

async function refreshAllFeeds() {
  console.log("[Auto Refresh] Starting refresh of all feeds...");

  const feeds = await prisma.feed.findMany();

  for (const feed of feeds) {
    try {
      const parsed = await parseFeed(feed.url);

      // Update feed info if needed
      const updateData: { imageUrl?: string; title?: string; siteUrl?: string } = {};

      if (!feed.imageUrl && parsed.link) {
        const favicon = await getFavicon(parsed.link);
        if (favicon) {
          updateData.imageUrl = favicon;
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
          where: { id: feed.id },
          data: updateData,
        });
      }

      // Process articles
      let newCount = 0;

      for (const item of parsed.items) {
        if (!item.link) continue;

        const existing = await prisma.article.findUnique({
          where: { link: item.link },
        });

        if (existing) {
          const shouldUpdate = item.content && (
            !existing.content || item.content !== existing.content
          );
          if (shouldUpdate) {
            await prisma.article.update({
              where: { link: item.link },
              data: {
                title: item.title,
                content: item.content,
                summary: item.summary,
                imageUrl: item.imageUrl,
              },
            });
          }
        } else {
          await prisma.article.create({
            data: {
              title: item.title,
              link: item.link,
              content: item.content,
              summary: item.summary,
              imageUrl: item.imageUrl,
              pubDate: item.pubDate,
              feedId: feed.id,
            },
          });
          newCount++;
        }
      }

      if (newCount > 0) {
        console.log(`[Auto Refresh] ${feed.title}: ${newCount} new articles`);
      }
    } catch (err) {
      console.error(`[Auto Refresh] Failed to refresh ${feed.title}:`, err);
    }
  }

  console.log("[Auto Refresh] Completed refresh of all feeds");
}

export async function startAutoRefresh() {
  // Clear existing interval if any
  if (globalForAutoRefresh.autoRefreshInterval) {
    clearInterval(globalForAutoRefresh.autoRefreshInterval);
    globalForAutoRefresh.autoRefreshInterval = null;
  }

  const interval = await getRefreshInterval();
  globalForAutoRefresh.lastRefreshInterval = interval;

  if (interval <= 0) {
    console.log("[Auto Refresh] Disabled");
    return;
  }

  const intervalMs = interval * 60 * 1000;
  console.log(`[Auto Refresh] Enabled, interval: ${interval} minutes`);

  // Set up interval
  globalForAutoRefresh.autoRefreshInterval = setInterval(async () => {
    // Re-check interval setting in case it changed
    const currentInterval = await getRefreshInterval();
    if (currentInterval !== globalForAutoRefresh.lastRefreshInterval) {
      console.log(`[Auto Refresh] Interval changed to ${currentInterval} minutes, restarting...`);
      startAutoRefresh();
      return;
    }

    if (currentInterval > 0) {
      await refreshAllFeeds();
    }
  }, intervalMs);
}

export async function restartAutoRefresh() {
  console.log("[Auto Refresh] Restarting...");
  await startAutoRefresh();
}

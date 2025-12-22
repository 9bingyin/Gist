import { prisma } from "@/lib/db";
import { refreshFeedsWithConcurrency } from "@/lib/feed-refresh";
import { getRefreshInterval } from "@/lib/settings";

const CONCURRENCY = 5;

const globalForAutoRefresh = globalThis as unknown as {
  autoRefreshInterval: ReturnType<typeof setInterval> | null;
  lastRefreshInterval: number;
};

async function refreshAllFeeds() {
  console.log("[Auto Refresh] Starting refresh of all feeds...");

  const feeds = await prisma.feed.findMany({ select: { id: true } });
  const feedIds = feeds.map((f) => f.id);

  const { success, failed } = await refreshFeedsWithConcurrency(
    feedIds,
    CONCURRENCY,
    (completed, total, feedTitle) => {
      if (feedTitle) {
        console.log(`[Auto Refresh] Progress: ${completed}/${total} - ${feedTitle}`);
      }
    }
  );

  console.log(
    `[Auto Refresh] Completed: ${success} succeeded, ${failed} failed`
  );
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
      console.log(
        `[Auto Refresh] Interval changed to ${currentInterval} minutes, restarting...`,
      );
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

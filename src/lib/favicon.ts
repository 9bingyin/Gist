/**
 * Fetch favicon for a website
 */

import { getUserAgent } from "@/lib/settings";
import { downloadAndSaveIcon } from "@/lib/icon-storage";

const FAVICON_TIMEOUT = 5000;

/**
 * Extract domain from URL
 */
function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return url;
  }
}

/**
 * Try to fetch favicon from website HTML
 */
async function fetchFaviconFromHtml(siteUrl: string, userAgent: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FAVICON_TIMEOUT);

    const response = await fetch(siteUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const html = await response.text();
    const domain = getDomain(siteUrl);

    // Try different favicon patterns in order of preference
    const patterns = [
      // Apple touch icon (usually higher quality)
      /<link[^>]+?rel=["']apple-touch-icon["'][^>]+?href=["']([^"']+)["']/i,
      /<link[^>]+?href=["']([^"']+)["'][^>]+?rel=["']apple-touch-icon["']/i,
      // Standard favicon with sizes
      /<link[^>]+?rel=["']icon["'][^>]+?sizes=["'](\d+)x\d+["'][^>]+?href=["']([^"']+)["']/i,
      // Standard favicon
      /<link[^>]+?rel=["'](?:shortcut )?icon["'][^>]+?href=["']([^"']+)["']/i,
      /<link[^>]+?href=["']([^"']+)["'][^>]+?rel=["'](?:shortcut )?icon["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        // Handle sized icon pattern (has size as first capture group)
        const href = match[2] || match[1];
        if (href) {
          // Convert relative URL to absolute
          if (href.startsWith("//")) {
            return `https:${href}`;
          } else if (href.startsWith("/")) {
            return `${domain}${href}`;
          } else if (!href.startsWith("http")) {
            return `${domain}/${href}`;
          }
          return href;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a favicon URL is accessible
 */
async function checkFaviconUrl(url: string, userAgent: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FAVICON_TIMEOUT);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
      },
    });
    clearTimeout(timeoutId);

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get favicon URL for a website
 * Tries multiple methods in order:
 * 1. Parse HTML for favicon link
 * 2. Try common favicon paths
 * 3. Use DuckDuckGo Favicon API as fallback
 */
async function findFaviconUrl(siteUrl: string): Promise<string | null> {
  if (!siteUrl) return null;

  const userAgent = await getUserAgent();
  const domain = getDomain(siteUrl);

  // Method 1: Try to extract from HTML
  const htmlFavicon = await fetchFaviconFromHtml(siteUrl, userAgent);
  if (htmlFavicon) {
    return htmlFavicon;
  }

  // Method 2: Try common favicon paths
  const commonPaths = [
    `${domain}/favicon.ico`,
    `${domain}/favicon.png`,
    `${domain}/apple-touch-icon.png`,
  ];

  for (const path of commonPaths) {
    if (await checkFaviconUrl(path, userAgent)) {
      return path;
    }
  }

  // Method 3: Use DuckDuckGo Favicon API as fallback
  try {
    const urlObj = new URL(siteUrl);
    return `https://external-content.duckduckgo.com/ip3/${urlObj.hostname}.ico`;
  } catch {
    return null;
  }
}

/**
 * Get favicon and save it locally
 * Returns the local filename (e.g., "example.com.png") or null if failed
 */
export async function getFavicon(siteUrl: string): Promise<string | null> {
  const iconUrl = await findFaviconUrl(siteUrl);
  if (!iconUrl) return null;

  const filename = await downloadAndSaveIcon(iconUrl, siteUrl);
  return filename;
}

/**
 * Fetch favicon for a website using external APIs
 */

import { downloadAndSaveIcon } from "@/lib/icon-storage";

/**
 * Get hostname from URL
 */
function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Get favicon URL using external APIs
 * Priority: Google > DuckDuckGo
 */
function getFaviconUrl(siteUrl: string): string | null {
  const hostname = getHostname(siteUrl);
  if (!hostname) return null;

  // Use Google's favicon service (t3.gstatic.cn is the Chinese CDN)
  return `https://t3.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${hostname}`;
}

/**
 * Get fallback favicon URL using DuckDuckGo
 */
function getFallbackFaviconUrl(siteUrl: string): string | null {
  const hostname = getHostname(siteUrl);
  if (!hostname) return null;

  return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
}

/**
 * Get favicon and save it locally
 * Returns the local filename (e.g., "example.com.png") or null if failed
 */
export async function getFavicon(siteUrl: string): Promise<string | null> {
  // Try Google first
  const googleUrl = getFaviconUrl(siteUrl);
  if (googleUrl) {
    const filename = await downloadAndSaveIcon(googleUrl, siteUrl);
    if (filename) return filename;
  }

  // Fallback to DuckDuckGo
  const ddgUrl = getFallbackFaviconUrl(siteUrl);
  if (ddgUrl) {
    const filename = await downloadAndSaveIcon(ddgUrl, siteUrl);
    if (filename) return filename;
  }

  return null;
}

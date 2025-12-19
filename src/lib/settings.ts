import { prisma } from "@/lib/db";

export const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; Gist/0.1.0; +https://github.com/9bingyin/Gist)";
export const DEFAULT_REFRESH_INTERVAL = 15; // minutes

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({
    where: { key },
  });
  return setting?.value ?? null;
}

export async function getUserAgent(): Promise<string> {
  const customUA = await getSetting("userAgent");
  return customUA || DEFAULT_USER_AGENT;
}

export async function getRefreshInterval(): Promise<number> {
  const interval = await getSetting("refreshInterval");
  if (interval) {
    const parsed = parseInt(interval, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      return parsed;
    }
  }
  return DEFAULT_REFRESH_INTERVAL;
}

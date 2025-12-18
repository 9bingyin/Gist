import { prisma } from "@/lib/db";

export const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

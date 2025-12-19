import { promises as fs } from "fs";
import path from "path";

const ICONS_DIR = path.join(process.cwd(), "data", "icons");
const ICON_TIMEOUT = 10000;

/**
 * Ensure icons directory exists
 */
async function ensureIconsDir() {
  try {
    await fs.access(ICONS_DIR);
  } catch {
    await fs.mkdir(ICONS_DIR, { recursive: true });
  }
}

/**
 * Get file extension from content type or URL
 */
function getExtension(contentType: string | null, url: string): string {
  if (contentType?.includes("svg")) return "svg";
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg"))
    return "jpg";
  if (contentType?.includes("gif")) return "gif";
  if (contentType?.includes("webp")) return "webp";
  if (
    contentType?.includes("x-icon") ||
    contentType?.includes("vnd.microsoft.icon")
  )
    return "ico";

  // Fallback to URL extension
  const urlExt = url.split(".").pop()?.split("?")[0]?.toLowerCase();
  if (
    urlExt &&
    ["svg", "png", "jpg", "jpeg", "gif", "webp", "ico"].includes(urlExt)
  ) {
    return urlExt === "jpeg" ? "jpg" : urlExt;
  }

  return "png";
}

/**
 * Extract hostname from URL
 */
function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Download and save icon to local storage
 * Source is trusted (Google/DuckDuckGo), minimal validation needed
 */
export async function downloadAndSaveIcon(
  iconUrl: string,
  siteUrl: string,
): Promise<string | null> {
  try {
    await ensureIconsDir();

    const hostname = getHostname(siteUrl);
    if (!hostname) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ICON_TIMEOUT);

    const response = await fetch(iconUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return null;

    const contentType = response.headers.get("content-type");
    const extension = getExtension(contentType, iconUrl);
    const filename = `${hostname}.${extension}`;
    const filepath = path.join(ICONS_DIR, filename);

    await fs.writeFile(filepath, Buffer.from(buffer));

    return filename;
  } catch {
    return null;
  }
}

/**
 * Check if icon file exists in storage
 */
export async function iconFileExists(filename: string): Promise<boolean> {
  try {
    await fs.access(path.join(ICONS_DIR, filename));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read icon file from storage
 */
export async function readIconFile(filename: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(ICONS_DIR, filename));
  } catch {
    return null;
  }
}

/**
 * Delete icon file from storage
 */
export async function deleteIconFile(filename: string): Promise<boolean> {
  try {
    await fs.unlink(path.join(ICONS_DIR, filename));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete all icon files from storage
 */
export async function deleteAllIconFiles(): Promise<number> {
  try {
    await ensureIconsDir();
    const files = await fs.readdir(ICONS_DIR);

    let count = 0;
    for (const file of files) {
      try {
        await fs.unlink(path.join(ICONS_DIR, file));
        count++;
      } catch {
        // Ignore
      }
    }

    return count;
  } catch {
    return 0;
  }
}

/**
 * Get content type from file extension
 */
export function getContentTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

import { promises as fs } from "fs";
import path from "path";
import { getUserAgent } from "@/lib/settings";

const ICONS_DIR = path.join(process.cwd(), "data", "icons");
const ICON_TIMEOUT = 10000;
const MAX_ICON_SIZE = 1024 * 1024; // 1MB max for icon files

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
function getExtensionFromContentType(
  contentType: string | null,
  url: string,
): string {
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
function getHostnameFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Validate if content type is an image
 */
function isValidImageContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const validTypes = [
    "image/",
    "application/octet-stream", // Some servers return this for .ico
  ];
  return validTypes.some((type) => contentType.toLowerCase().includes(type));
}

/**
 * Validate if response is actually an image
 */
function isValidImageBuffer(
  buffer: ArrayBuffer,
  contentType: string | null,
): boolean {
  const bytes = new Uint8Array(buffer);

  // Too small to be a valid image
  if (bytes.length < 10) return false;

  // SVG validation (must check before the '<' character check)
  if (
    contentType?.includes("svg") ||
    (bytes[0] === 0x3c && contentType === null)
  ) {
    const text = new TextDecoder().decode(bytes);
    const lowerText = text.toLowerCase();

    // Check if it's a valid SVG
    if (lowerText.includes("<svg") || lowerText.includes("<?xml")) {
      // Security: Dangerous SVG patterns
      const dangerousPatterns = [
        "<script",
        "javascript:",
        "vbscript:",
        // Event handlers
        "onload=",
        "onerror=",
        "onclick=",
        "onmouseover=",
        "onfocus=",
        // Embedded content
        "<iframe",
        "<embed",
        "<object",
        "<foreignobject",
      ];

      for (const pattern of dangerousPatterns) {
        if (lowerText.includes(pattern)) {
          console.warn(`SVG contains dangerous pattern: ${pattern}`);
          return false;
        }
      }

      return true;
    }
  }

  // For non-SVG files, reject if starts with '<' (likely HTML)
  if (bytes[0] === 0x3c) {
    return false;
  }

  // Check for common image file signatures
  // PNG: 89 50 4E 47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }

  // JPEG/JPG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }

  // GIF: 47 49 46
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return true;
  }

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return true;
  }

  // ICO: 00 00 01 00 or 00 00 02 00
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    (bytes[2] === 0x01 || bytes[2] === 0x02) &&
    bytes[3] === 0x00
  ) {
    return true;
  }

  return false;
}

/**
 * Download and save icon to local storage
 */
export async function downloadAndSaveIcon(
  iconUrl: string,
  siteUrl: string,
): Promise<string | null> {
  try {
    await ensureIconsDir();

    const hostname = getHostnameFromUrl(siteUrl);
    if (!hostname) return null;

    const userAgent = await getUserAgent();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ICON_TIMEOUT);

    const response = await fetch(iconUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type");

    // Validate content type
    if (!isValidImageContentType(contentType)) {
      console.warn(`Invalid content type for ${iconUrl}: ${contentType}`);
      return null;
    }

    const buffer = await response.arrayBuffer();

    // Security: Check file size
    if (buffer.byteLength === 0) {
      console.warn(`Empty file from ${iconUrl}`);
      return null;
    }

    if (buffer.byteLength > MAX_ICON_SIZE) {
      console.warn(
        `File too large from ${iconUrl}: ${buffer.byteLength} bytes`,
      );
      return null;
    }

    // Validate buffer is actually an image
    if (!isValidImageBuffer(buffer, contentType)) {
      console.warn(`Invalid image data from ${iconUrl}`);
      return null;
    }

    const extension = getExtensionFromContentType(contentType, iconUrl);
    const filename = `${hostname}.${extension}`;
    const filepath = path.join(ICONS_DIR, filename);

    // Security: Validate final filepath is within ICONS_DIR
    const resolvedPath = path.resolve(filepath);
    const resolvedIconsDir = path.resolve(ICONS_DIR);
    if (!resolvedPath.startsWith(resolvedIconsDir)) {
      console.error(`Security: Path traversal attempt blocked: ${filename}`);
      return null;
    }

    await fs.writeFile(filepath, Buffer.from(buffer));

    return filename;
  } catch (error) {
    console.error(`Failed to download icon from ${iconUrl}:`, error);
    return null;
  }
}

/**
 * Check if icon file exists in storage
 */
export async function iconFileExists(filename: string): Promise<boolean> {
  try {
    const filepath = path.join(ICONS_DIR, filename);
    await fs.access(filepath);
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
    const filepath = path.join(ICONS_DIR, filename);
    return await fs.readFile(filepath);
  } catch {
    return null;
  }
}

/**
 * Delete icon file from storage
 */
export async function deleteIconFile(filename: string): Promise<boolean> {
  try {
    const filepath = path.join(ICONS_DIR, filename);
    await fs.unlink(filepath);
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

    let deletedCount = 0;
    for (const file of files) {
      try {
        await fs.unlink(path.join(ICONS_DIR, file));
        deletedCount++;
      } catch {
        // Ignore errors for individual files
      }
    }

    return deletedCount;
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

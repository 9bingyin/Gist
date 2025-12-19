import { NextRequest, NextResponse } from "next/server";
import { readIconFile, getContentTypeFromExtension } from "@/lib/icon-storage";

/**
 * Validate file is a safe image (not HTML or script)
 */
function isValidImageFile(buffer: Buffer, filename: string): boolean {
  const bytes = new Uint8Array(buffer);

  // Check file is not empty
  if (bytes.length === 0) return false;

  // Reject if starts with HTML tag
  if (bytes[0] === 0x3C) { // '<' character
    return false;
  }

  // For SVG files, check for malicious content
  if (filename.endsWith(".svg")) {
    const text = new TextDecoder().decode(bytes);
    const lowerText = text.toLowerCase();

    // Reject if contains scripts or event handlers
    if (
      lowerText.includes("<script") ||
      lowerText.includes("javascript:") ||
      lowerText.includes("onload=") ||
      lowerText.includes("onerror=") ||
      lowerText.includes("onclick=") ||
      lowerText.includes("onmouseover=") ||
      lowerText.includes("<iframe") ||
      lowerText.includes("<embed") ||
      lowerText.includes("<object")
    ) {
      return false;
    }
  }

  return true;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Validate filename to prevent directory traversal and injection
  if (
    !filename ||
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0") || // Null byte injection
    filename.length > 255 // Reasonable filename length
  ) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Only allow specific image extensions
  const allowedExtensions = [".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp"];
  if (!allowedExtensions.some((ext) => filename.toLowerCase().endsWith(ext))) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  const buffer = await readIconFile(filename);

  if (!buffer) {
    return NextResponse.json({ error: "Icon not found" }, { status: 404 });
  }

  // Security: Validate file content
  if (!isValidImageFile(buffer, filename)) {
    console.error(`Security: Invalid or malicious file detected: ${filename}`);
    return NextResponse.json({ error: "Invalid file content" }, { status: 400 });
  }

  const contentType = getContentTypeFromExtension(filename);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      // Security headers
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline';",
    },
  });
}

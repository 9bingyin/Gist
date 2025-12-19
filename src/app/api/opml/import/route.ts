import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFeed } from "@/lib/rss";
import { getFavicon } from "@/lib/favicon";
import { taskQueue } from "@/lib/task-queue";

interface OpmlItem {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  folder?: string;
}

function parseOpml(content: string): OpmlItem[] {
  const items: OpmlItem[] = [];

  const outlineTagRegex = /<outline\s+([^>]*?)\s*\/?>/gi;
  const closingTagRegex = /<\/outline>/gi;

  const folderStack: string[] = [];

  interface TagInfo {
    type: "open" | "close";
    index: number;
    attrs?: Record<string, string>;
    isSelfClosing?: boolean;
  }

  const tags: TagInfo[] = [];

  let match;
  while ((match = outlineTagRegex.exec(content)) !== null) {
    const attrs: Record<string, string> = {};
    let attrMatch;
    const attrRegexLocal = /(\w+)="([^"]*)"/g;

    while ((attrMatch = attrRegexLocal.exec(match[1])) !== null) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2];
    }

    const isSelfClosing = match[0].endsWith("/>");

    tags.push({
      type: "open",
      index: match.index,
      attrs,
      isSelfClosing,
    });
  }

  while ((match = closingTagRegex.exec(content)) !== null) {
    tags.push({
      type: "close",
      index: match.index,
    });
  }

  tags.sort((a, b) => a.index - b.index);

  for (const tag of tags) {
    if (tag.type === "close") {
      folderStack.pop();
    } else if (tag.attrs) {
      const attrs = tag.attrs;

      if (attrs.xmlurl) {
        items.push({
          title: attrs.title || attrs.text || attrs.xmlurl,
          xmlUrl: attrs.xmlurl,
          htmlUrl: attrs.htmlurl,
          folder:
            folderStack.length > 0
              ? folderStack[folderStack.length - 1]
              : undefined,
        });
      } else if ((attrs.text || attrs.title) && !tag.isSelfClosing) {
        folderStack.push(attrs.text || attrs.title);
      }
    }
  }

  return items;
}

async function processImport(taskId: string, items: OpmlItem[]) {
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  taskQueue.update(taskId, {
    status: "running",
    progress: {
      current: 0,
      total: items.length,
      message: "Starting import...",
    },
  });

  for (let i = 0; i < items.length; i++) {
    // Check if task was cancelled
    if (taskQueue.isCancelled(taskId)) {
      taskQueue.update(taskId, {
        progress: {
          current: i,
          total: items.length,
          message: "Import cancelled",
        },
        result: { imported, skipped, failed },
      });
      return;
    }

    const item = items[i];

    taskQueue.update(taskId, {
      progress: {
        current: i,
        total: items.length,
        message: item.title,
        detail: item.folder ? `Folder: ${item.folder}` : undefined,
      },
    });

    try {
      // Create folder if needed
      let folderId: string | null = null;
      if (item.folder) {
        const existingFolder = await prisma.folder.findFirst({
          where: { name: item.folder },
        });
        if (existingFolder) {
          folderId = existingFolder.id;
        } else {
          const newFolder = await prisma.folder.create({
            data: { name: item.folder },
          });
          folderId = newFolder.id;
        }
      }

      // Check if feed already exists
      const existingFeed = await prisma.feed.findUnique({
        where: { url: item.xmlUrl },
      });

      if (existingFeed) {
        if (folderId && existingFeed.folderId !== folderId) {
          await prisma.feed.update({
            where: { id: existingFeed.id },
            data: { folderId },
          });
        }
        skipped++;
        continue;
      }

      // Try to parse and add the feed
      try {
        const feedData = await parseFeed(item.xmlUrl);

        // Prefer OPML title over parsed title (parsed title might be error message)
        const title = item.title || feedData.title || item.xmlUrl;

        const newFeed = await prisma.feed.create({
          data: {
            title,
            url: item.xmlUrl,
            siteUrl: feedData.link || item.htmlUrl,
            description: feedData.description,
            folderId,
            articles: {
              create: feedData.items.slice(0, 30).map((article) => ({
                title: article.title,
                link: article.link,
                content: article.content,
                summary: article.summary,
                imageUrl: article.imageUrl,
                pubDate: article.pubDate,
              })),
            },
          },
        });

        // Get and save favicon after feed is created
        if (feedData.link) {
          const iconFilename = await getFavicon(feedData.link);
          if (iconFilename) {
            await prisma.feed.update({
              where: { id: newFeed.id },
              data: { imageUrl: iconFilename },
            });
          }
        }

        imported++;
      } catch {
        // If parsing fails, create a placeholder feed
        await prisma.feed.create({
          data: {
            title: item.title || item.xmlUrl,
            url: item.xmlUrl,
            siteUrl: item.htmlUrl,
            folderId,
          },
        });
        imported++;
      }
    } catch (err) {
      console.error(`Failed to import ${item.xmlUrl}:`, err);
      failed++;
    }

    // Update result after each item so cancel can show correct counts
    taskQueue.update(taskId, {
      result: { imported, skipped, failed },
    });
  }

  taskQueue.update(taskId, {
    status: "completed",
    progress: {
      current: items.length,
      total: items.length,
      message: "Import completed",
    },
    result: { imported, skipped, failed },
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const content = await file.text();
    const parsed = parseOpml(content);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "No feeds found in OPML file" },
        { status: 400 }
      );
    }

    // Create task
    const task = taskQueue.create("opml-import", parsed.length);

    // Start processing in background (don't await)
    processImport(task.id, parsed).catch((err) => {
      console.error("Import failed:", err);
      taskQueue.update(task.id, {
        status: "failed",
        result: { error: err instanceof Error ? err.message : "Unknown error" },
      });
    });

    // Return task ID immediately
    return NextResponse.json({ taskId: task.id });
  } catch (error) {
    console.error("Failed to start import:", error);
    return NextResponse.json(
      { error: "Failed to parse OPML file" },
      { status: 400 }
    );
  }
}

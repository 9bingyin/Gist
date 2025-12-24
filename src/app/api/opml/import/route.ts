import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFeed } from "@/lib/rss";
import { getFavicon } from "@/lib/favicon";
import { taskQueue } from "@/lib/task-queue";
import { parseOpml as parseOpmlLib } from "feedsmith";

interface OpmlItem {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  folder?: string;
}

interface OpmlOutline {
  text?: string;
  title?: string;
  xmlUrl?: string;
  htmlUrl?: string;
  outlines?: OpmlOutline[];
}

function extractFeeds(outlines: OpmlOutline[], folderName?: string): OpmlItem[] {
  const items: OpmlItem[] = [];

  for (const outline of outlines) {
    if (outline.xmlUrl) {
      items.push({
        title: outline.title || outline.text || outline.xmlUrl,
        xmlUrl: outline.xmlUrl,
        htmlUrl: outline.htmlUrl,
        folder: folderName,
      });
    } else if (outline.outlines && outline.outlines.length > 0) {
      const folder = outline.text || outline.title;
      items.push(...extractFeeds(outline.outlines, folder));
    }
  }

  return items;
}

function parseOpml(content: string): OpmlItem[] {
  const opml = parseOpmlLib(content);
  if (!opml.body?.outlines) {
    return [];
  }
  return extractFeeds(opml.body.outlines as OpmlOutline[]);
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
      let folderType: string = "article";
      if (item.folder) {
        const existingFolder = await prisma.folder.findFirst({
          where: { name: item.folder },
          select: { id: true, type: true },
        });
        if (existingFolder) {
          folderId = existingFolder.id;
          folderType = existingFolder.type;
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
        type ParsedItemWithLink = typeof feedData.items[number] & {
          link: string;
        };
        const uniqueItems = new Map<string, ParsedItemWithLink>();
        for (const article of feedData.items) {
          const link = article.link?.trim();
          if (!link) continue;
          if (!uniqueItems.has(link)) {
            uniqueItems.set(link, { ...article, link });
          }
        }
        const articles = Array.from(uniqueItems.values()).slice(0, 30);

        // Prefer OPML title over parsed title (parsed title might be error message)
        const title = item.title || feedData.title || item.xmlUrl;

        const newFeed = await prisma.feed.create({
          data: {
            title,
            url: item.xmlUrl,
            siteUrl: feedData.link || item.htmlUrl,
            description: feedData.description,
            folderId,
            type: folderType,
            articles: {
              create: articles.map((article) => ({
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
            type: folderType,
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
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.text();
    const parsed = parseOpml(content);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "No feeds found in OPML file" },
        { status: 400 },
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
      { status: 400 },
    );
  }
}

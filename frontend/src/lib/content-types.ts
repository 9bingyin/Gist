import type { ContentType, Feed, Folder } from "@/types/api";
import type { AppearanceSettings } from "@/types/settings";

export const DEFAULT_CONTENT_TYPES: ContentType[] = [
  "article",
  "picture",
  "notification",
];

export function isContentType(value: string | null): value is ContentType {
  return value === "article" || value === "picture" || value === "notification";
}

export function getVisibleContentTypes(
  appearanceSettings?: AppearanceSettings,
): ContentType[] {
  const current = appearanceSettings?.contentTypes;
  if (!current || current.length === 0) return DEFAULT_CONTENT_TYPES;
  const filtered = current.filter(isContentType);
  return filtered.length > 0 ? filtered : DEFAULT_CONTENT_TYPES;
}

export function createFeedsMap(feeds: Feed[]): Map<string, Feed> {
  const map = new Map<string, Feed>();
  for (const feed of feeds) {
    map.set(feed.id, feed);
  }
  return map;
}

export function createFoldersMap(folders: Folder[]): Map<string, Folder> {
  const map = new Map<string, Folder>();
  for (const folder of folders) {
    map.set(folder.id, folder);
  }
  return map;
}

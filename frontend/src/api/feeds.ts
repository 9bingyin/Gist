import type { ContentType, Feed, FeedPreview } from "@/types/api";
import { request } from "./client";

export interface RefreshStatus {
  isRefreshing: boolean;
  lastRefreshedAt?: string;
}

export async function listFeeds(folderId?: string): Promise<Feed[]> {
  const params =
    folderId === undefined ? "" : `?folderId=${encodeURIComponent(folderId)}`;
  return request<Feed[]>(`/api/feeds${params}`);
}

export async function createFeed(payload: {
  url: string;
  folderId?: string;
  title?: string;
  type?: ContentType;
}): Promise<Feed> {
  return request<Feed>("/api/feeds", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateFeed(
  id: string,
  payload: { title: string; folderId?: string; summaryPromptReminder?: string },
): Promise<Feed> {
  return request<Feed>(`/api/feeds/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteFeed(id: string): Promise<void> {
  return request<void>(`/api/feeds/${id}`, {
    method: "DELETE",
  });
}

export async function updateFeedType(
  id: string,
  type: ContentType,
): Promise<void> {
  return request<void>(`/api/feeds/${id}/type`, {
    method: "PATCH",
    body: JSON.stringify({ type }),
  });
}

export async function deleteFeeds(ids: string[]): Promise<void> {
  return request<void>("/api/feeds", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

export async function refreshAllFeeds(): Promise<void> {
  return request<void>("/api/feeds/refresh", {
    method: "POST",
  });
}

export async function getRefreshStatus(): Promise<RefreshStatus> {
  return request<RefreshStatus>("/api/feeds/refresh");
}

export async function previewFeed(url: string): Promise<FeedPreview> {
  const params = new URLSearchParams({ url });
  return request<FeedPreview>(`/api/feeds/preview?${params.toString()}`);
}

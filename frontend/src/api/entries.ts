import type {
  Entry,
  EntryListParams,
  EntryListResponse,
  MarkAllReadParams,
  StarredCountResponse,
  UnreadCountsResponse,
} from "@/types/api";
import { request } from "./client";

export async function listEntries(
  params: EntryListParams = {},
): Promise<EntryListResponse> {
  const searchParams = new URLSearchParams();

  if (params.feedId !== undefined) {
    searchParams.set("feedId", String(params.feedId));
  }
  if (params.folderId !== undefined) {
    searchParams.set("folderId", String(params.folderId));
  }
  if (params.contentType !== undefined) {
    searchParams.set("contentType", params.contentType);
  }
  if (params.unreadOnly) {
    searchParams.set("unreadOnly", "true");
  }
  if (params.starredOnly) {
    searchParams.set("starredOnly", "true");
  }
  if (params.hasThumbnail) {
    searchParams.set("hasThumbnail", "true");
  }
  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.offset !== undefined) {
    searchParams.set("offset", String(params.offset));
  }

  const queryString = searchParams.toString();
  const path = queryString ? `/api/entries?${queryString}` : "/api/entries";
  return request<EntryListResponse>(path);
}

export async function getEntry(id: string): Promise<Entry> {
  return request<Entry>(`/api/entries/${id}`);
}

export async function updateEntryReadStatus(
  id: string,
  read: boolean,
): Promise<void> {
  return request<void>(`/api/entries/${id}/read`, {
    method: "PATCH",
    body: JSON.stringify({ read }),
  });
}

export async function updateManyEntryReadStatus(
  ids: string[],
  read: boolean,
): Promise<void> {
  return request<void>("/api/entries/read", {
    method: "PATCH",
    body: JSON.stringify({ ids, read }),
  });
}

export async function fetchReadableContent(
  id: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await request<{ readableContent: string }>(
    `/api/entries/${id}/fetch-readable`,
    {
      method: "POST",
      signal,
    },
  );
  return response.readableContent;
}

export async function markAllAsRead(params: MarkAllReadParams): Promise<void> {
  return request<void>("/api/entries/mark-read", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getUnreadCounts(): Promise<UnreadCountsResponse> {
  return request<UnreadCountsResponse>("/api/unread-counts");
}

export async function updateEntryStarred(
  id: string,
  starred: boolean,
): Promise<void> {
  return request<void>(`/api/entries/${id}/starred`, {
    method: "PATCH",
    body: JSON.stringify({ starred }),
  });
}

export async function getStarredCount(): Promise<StarredCountResponse> {
  return request<StarredCountResponse>("/api/starred-count");
}

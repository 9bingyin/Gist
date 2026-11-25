import type { ContentType, Folder } from "@/types/api";
import { request } from "./client";

export async function listFolders(): Promise<Folder[]> {
  return request<Folder[]>("/api/folders");
}

export async function createFolder(payload: {
  name: string;
  parentId?: string;
  type?: ContentType;
}): Promise<Folder> {
  return request<Folder>("/api/folders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateFolder(
  id: string,
  payload: { name: string; parentId?: string },
): Promise<Folder> {
  return request<Folder>(`/api/folders/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteFolder(id: string): Promise<void> {
  return request<void>(`/api/folders/${id}`, {
    method: "DELETE",
  });
}

export async function updateFolderType(
  id: string,
  type: ContentType,
): Promise<void> {
  return request<void>(`/api/folders/${id}/type`, {
    method: "PATCH",
    body: JSON.stringify({ type }),
  });
}

export async function deleteFolders(ids: string[]): Promise<void> {
  return request<void>("/api/folders", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

import type { ImportTask } from "@/types/api";
import { authFetch, readSSEEvents, request } from "./client";

export async function startImportOPML(file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);

  await authFetch("/api/opml/import", {
    method: "POST",
    body: formData,
  });
}

export async function cancelImportOPML(): Promise<boolean> {
  const result = await request<{ cancelled: boolean }>("/api/opml/import", {
    method: "DELETE",
  });
  return result.cancelled;
}

export function watchImportStatus(
  onUpdate: (task: ImportTask) => void,
): () => void {
  const controller = new AbortController();

  const connect = async () => {
    try {
      const response = await authFetch("/api/opml/import/status", {
        signal: controller.signal,
      });

      for await (const task of readSSEEvents<ImportTask>(response)) {
        if (controller.signal.aborted) break;
        onUpdate(task);

        if (
          task.status === "done" ||
          task.status === "error" ||
          task.status === "cancelled"
        ) {
          controller.abort();
          break;
        }
      }
    } catch {
      // Connection aborted or network error
    }
  };

  void connect();

  return () => {
    controller.abort();
  };
}

export async function exportOPML(): Promise<void> {
  const response = await authFetch("/api/opml/export");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gist.opml";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

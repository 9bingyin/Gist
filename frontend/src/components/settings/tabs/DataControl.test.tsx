import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ImportTask } from "@/types/api";
import { DataControl } from "./DataControl";

const startImportOPMLMock = vi.fn();
const watchImportStatusMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@/api", () => ({
  startImportOPML: (...args: unknown[]) => startImportOPMLMock(...args),
  watchImportStatus: (...args: unknown[]) => watchImportStatusMock(...args),
  cancelImportOPML: vi.fn(),
  exportOPML: vi.fn(),
  clearAICache: vi.fn(),
  clearAnubisCookies: vi.fn(),
  clearIconCache: vi.fn(),
  clearReadabilityCache: vi.fn(),
  clearEntryCache: vi.fn(),
}));

describe("DataControl OPML import SSE subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resubscribes on consecutive OPML imports and cleans up on unmount", async () => {
    const callbacks: Array<(task: ImportTask) => void> = [];
    const cancels: Array<ReturnType<typeof vi.fn>> = [];

    watchImportStatusMock.mockImplementation(
      (cb: (task: ImportTask) => void) => {
        callbacks.push(cb);
        const cancel = vi.fn();
        cancels.push(cancel);
        return cancel;
      },
    );
    startImportOPMLMock.mockResolvedValue({ status: "started" });

    const queryClient = new QueryClient();
    const { container, unmount } = render(
      <QueryClientProvider client={queryClient}>
        <DataControl />
      </QueryClientProvider>,
    );

    // Initial subscription on mount
    expect(watchImportStatusMock).toHaveBeenCalledTimes(1);

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    // First import
    const file1 = new File(["<opml/>"], "first.opml", { type: "text/xml" });
    fireEvent.change(fileInput, { target: { files: [file1] } });

    await waitFor(() => {
      expect(startImportOPMLMock).toHaveBeenCalledTimes(1);
      expect(watchImportStatusMock).toHaveBeenCalledTimes(2);
    });
    expect(cancels[0]).toHaveBeenCalledTimes(1);

    // First import finishes (server closes SSE on terminal state)
    callbacks[1]?.({
      id: "task-1",
      status: "done",
      total: 1,
      current: 1,
      result: {
        foldersCreated: 1,
        foldersSkipped: 0,
        feedsCreated: 2,
        feedsSkipped: 0,
      },
    });

    await waitFor(() => {
      expect(screen.getByText("data_control.import_success")).toBeTruthy();
      expect(
        screen.getByText('data_control.feeds_created:{"count":2}'),
      ).toBeTruthy();
    });

    // Second import on the same mounted page must resubscribe
    const file2 = new File(["<opml/>"], "second.opml", { type: "text/xml" });
    fireEvent.change(fileInput, { target: { files: [file2] } });

    await waitFor(() => {
      expect(startImportOPMLMock).toHaveBeenCalledTimes(2);
      expect(watchImportStatusMock).toHaveBeenCalledTimes(3);
    });
    expect(cancels[1]).toHaveBeenCalledTimes(1);

    callbacks[2]?.({
      id: "task-2",
      status: "done",
      total: 3,
      current: 3,
      result: {
        foldersCreated: 2,
        foldersSkipped: 0,
        feedsCreated: 5,
        feedsSkipped: 1,
      },
    });

    await waitFor(() => {
      expect(
        screen.getByText('data_control.feeds_created:{"count":5}'),
      ).toBeTruthy();
    });

    // Unmount cancels latest active subscription
    unmount();
    expect(cancels[2]).toHaveBeenCalledTimes(1);
  });
});

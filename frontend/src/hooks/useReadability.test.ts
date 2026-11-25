import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entry } from "@/types/api";
import { useReadability } from "./useReadability";

const mockFetchReadableContent =
  vi.fn<(id: string, signal?: AbortSignal) => Promise<string>>();

vi.mock("@/api", () => ({
  fetchReadableContent: (id: string, signal?: AbortSignal) =>
    mockFetchReadableContent(id, signal),
}));

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "entry-1",
    feedId: "feed-1",
    title: "Test Entry",
    url: "https://example.com/article-1",
    content: "<p>Original</p>",
    readableContent: undefined,
    thumbnailUrl: undefined,
    author: "Author",
    publishedAt: "2026-01-01T00:00:00Z",
    read: false,
    starred: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

describe("useReadability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not infinite-retry when auto readability fetch fails", async () => {
    mockFetchReadableContent.mockRejectedValue(new Error("Network error"));
    const queryClient = new QueryClient();
    const entry = makeEntry();

    const { result } = renderHook(
      () => useReadability({ entry, autoReadability: true }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.readableError).toBe("Network error");
    });

    expect(result.current.isReadableLoading).toBe(false);
    expect(mockFetchReadableContent).toHaveBeenCalledTimes(1);
  });

  it("stays closed after user manually toggles readability off", async () => {
    const queryClient = new QueryClient();
    const entry = makeEntry({
      readableContent: "<p>Cached readable</p>",
    });

    const { result } = renderHook(
      () => useReadability({ entry, autoReadability: true }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isReadableActive).toBe(true);
    });

    await act(async () => {
      await result.current.handleToggleReadable();
    });

    expect(result.current.showReadable).toBe(false);
    expect(result.current.isReadableActive).toBe(false);
    expect(result.current.baseContent).toBe("<p>Original</p>");
  });

  it("aborts stale request on rapid entry switch and updates Query cache on success", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    let resolveFirst: ((value: string) => void) | null = null;

    mockFetchReadableContent.mockImplementation((id, signal) => {
      signals.push(signal);
      if (id === "entry-1") {
        return new Promise<string>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve("<p>Readable 2</p>");
    });

    const queryClient = new QueryClient();
    const entry1 = makeEntry({ id: "entry-1", url: "https://example.com/1" });
    const entry2 = makeEntry({ id: "entry-2", url: "https://example.com/2" });
    queryClient.setQueryData(["entry", "entry-2"], entry2);

    const { result, rerender } = renderHook(
      ({ entry }) => useReadability({ entry, autoReadability: true }),
      {
        initialProps: { entry: entry1 },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(mockFetchReadableContent).toHaveBeenCalledWith(
        "entry-1",
        expect.any(AbortSignal),
      );
    });

    rerender({ entry: entry2 });

    expect(signals[0]?.aborted).toBe(true);

    await waitFor(() => {
      expect(result.current.readableContent).toBe("<p>Readable 2</p>");
      expect(result.current.isReadableActive).toBe(true);
    });

    // Resolve stale first request after switch - should not overwrite entry-2
    await act(async () => {
      resolveFirst?.("<p>Stale Readable 1</p>");
    });

    expect(result.current.readableContent).toBe("<p>Readable 2</p>");
    const cachedEntry2 = queryClient.getQueryData<Entry>(["entry", "entry-2"]);
    expect(cachedEntry2?.readableContent).toBe("<p>Readable 2</p>");
  });
});

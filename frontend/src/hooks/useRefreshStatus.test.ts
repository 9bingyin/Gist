import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REFRESH_STATUS_QUERY_KEY, useRefreshStatus } from "./useRefreshStatus";

const mockGetRefreshStatus =
  vi.fn<() => Promise<{ isRefreshing: boolean; lastRefreshedAt?: string }>>();

vi.mock("@/api", () => ({
  getRefreshStatus: () => mockGetRefreshStatus(),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

describe("useRefreshStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses 1500ms polling when refreshing and 15000ms when idle", async () => {
    mockGetRefreshStatus.mockResolvedValueOnce({
      isRefreshing: true,
      lastRefreshedAt: "2026-01-01T00:00:00Z",
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useRefreshStatus(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(true);
    });

    const query = queryClient.getQueryCache().find({
      queryKey: REFRESH_STATUS_QUERY_KEY,
    });
    expect(query).toBeDefined();
    const observer = query?.observers[0];
    const refetchInterval = observer?.options.refetchInterval;
    expect(typeof refetchInterval).toBe("function");

    if (typeof refetchInterval === "function" && query) {
      expect(refetchInterval(query)).toBe(1500);

      queryClient.setQueryData(REFRESH_STATUS_QUERY_KEY, {
        isRefreshing: false,
        lastRefreshedAt: "2026-01-01T00:01:00Z",
      });

      expect(refetchInterval(query)).toBe(15_000);
    }
  });

  it("invalidates entries, unreadCounts and feeds when refresh completes", async () => {
    mockGetRefreshStatus.mockResolvedValueOnce({
      isRefreshing: true,
      lastRefreshedAt: "2026-01-01T00:00:00Z",
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRefreshStatus(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(true);
    });

    queryClient.setQueryData(REFRESH_STATUS_QUERY_KEY, {
      isRefreshing: false,
      lastRefreshedAt: "2026-01-01T00:02:00Z",
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entries"] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["unreadCounts"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["feeds"] });
    });
  });
});

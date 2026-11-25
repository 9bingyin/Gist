import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthToken, setAuthToken } from "@/api";
import { queryClient } from "@/lib/queryClient";
import { useImagePreviewStore } from "./image-preview-store";
import { useLightboxStore } from "./lightbox-store";
import { useTranslationStore } from "./translation-store";
import { useAuthStore } from "./auth-store";

describe("auth-store", () => {
  const storage = (() => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => {
        data.clear();
      },
    };
  })();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", storage);
    localStorage.clear();
    useAuthStore.setState({
      state: "loading",
      user: null,
      error: null,
      shouldRedirectToRoot: false,
    });
  });

  it("401 初始化失败时只清本地会话，不调用 logout 接口", async () => {
    setAuthToken("expired-token");

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ exists: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "invalid token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await useAuthStore.getState().initialize();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/status");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/auth/me");
    expect(getAuthToken()).toBeNull();
    expect(useAuthStore.getState().state).toBe("unauthenticated");
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().shouldRedirectToRoot).toBe(true);
  });

  it("handleUnauthorized 会直接清理本地 token 并触发回根路径", () => {
    setAuthToken("expired-token");
    useAuthStore.setState({
      state: "authenticated",
      user: {
        username: "alice",
        nickname: "Alice",
        email: "alice@example.com",
        avatarUrl: "",
      },
      error: "stale error",
    });

    useAuthStore.getState().handleUnauthorized();

    expect(getAuthToken()).toBeNull();
    expect(useAuthStore.getState().state).toBe("unauthenticated");
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().error).toBeNull();
    expect(useAuthStore.getState().shouldRedirectToRoot).toBe(true);
  });

  it("consumeRootRedirect 会清除一次性跳转标记", () => {
    useAuthStore.setState({ shouldRedirectToRoot: true });

    useAuthStore.getState().consumeRootRedirect();

    expect(useAuthStore.getState().shouldRedirectToRoot).toBe(false);
  });

  it("initialize 并发调用会幂等复用同一 Promise", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ exists: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await Promise.all([
      useAuthStore.getState().initialize(),
      useAuthStore.getState().initialize(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().state).toBe("no-user");
  });

  it("handleUnauthorized 会清空 queryClient、翻译缓存与媒体预览状态", () => {
    setAuthToken("expired-token");
    queryClient.setQueryData(["entries"], { items: [] });
    useTranslationStore
      .getState()
      .setTranslation("entry-1", "zh-CN", { title: "标题" });
    useImagePreviewStore.getState().open(["https://example.com/a.jpg"]);
    useLightboxStore.getState().open(
      {
        id: "entry-1",
        feedId: "feed-1",
        title: "Pic",
        url: "https://example.com/1",
        content: "",
        read: false,
        starred: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      undefined,
      ["https://example.com/a.jpg"],
    );

    useAuthStore.getState().handleUnauthorized();

    expect(queryClient.getQueryData(["entries"])).toBeUndefined();
    expect(
      useTranslationStore.getState().getTranslation("entry-1", "zh-CN"),
    ).toBeUndefined();
    expect(useImagePreviewStore.getState().isOpen).toBe(false);
    expect(useLightboxStore.getState().isOpen).toBe(false);
  });
});

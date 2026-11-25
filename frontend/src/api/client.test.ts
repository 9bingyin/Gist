import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  authFetch,
  readSSEEvents,
  setAuthToken,
  setOnUnauthorized,
} from "./client";
import { watchImportStatus } from "./opml";
import { streamSummary } from "./ai";

function createStorageMock() {
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
}

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", createStorageMock());
    localStorage.clear();
  });

  it("authFetch injects Authorization header and invokes onUnauthorized on 401", async () => {
    setAuthToken("token-123");
    const onUnauthorized = vi.fn();
    setOnUnauthorized(onUnauthorized);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(authFetch("/api/test")).rejects.toThrow(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("readSSEEvents flushes trailing buffer without trailing newline", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"step":1}\n\n'));
        controller.enqueue(encoder.encode('data: {"step":2}'));
        controller.close();
      },
    });

    const events: Array<{ step: number }> = [];
    for await (const event of readSSEEvents<{ step: number }>(
      new Response(stream),
    )) {
      events.push(event);
    }

    expect(events).toEqual([{ step: 1 }, { step: 2 }]);
  });

  it("readSSEEvents cancels underlying stream reader on early break", async () => {
    const encoder = new TextEncoder();
    const cancelSpy = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"step":1}\ndata: {"step":2}\n'),
        );
      },
      cancel() {
        cancelSpy();
      },
    });

    const received: Array<{ step: number }> = [];
    for await (const event of readSSEEvents<{ step: number }>(
      new Response(stream),
    )) {
      received.push(event);
      break;
    }

    expect(received).toEqual([{ step: 1 }]);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it("watchImportStatus aborts SSE request when cleanup is called", () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce((_input, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {
        // Keep pending until aborted
      });
    });

    const stop = watchImportStatus(vi.fn());
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    stop();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("streamSummary yields SSE chunks and finishes on done event", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"chunk":"Hello "}\n\n'));
        controller.enqueue(encoder.encode('data: {"chunk":"world"}\n\n'));
        controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
        controller.close();
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const chunks: Array<string | { cached: true; summary: string }> = [];
    for await (const chunk of streamSummary({
      entryId: "1",
      content: "body",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello ", "world"]);
  });

  it("streamSummary throws on SSE error event", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"chunk":"Half"}\n\n'));
        controller.enqueue(
          encoder.encode('data: {"error":"AI provider failed"}\n\n'),
        );
        controller.close();
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const consume = async () => {
      for await (const _chunk of streamSummary({
        entryId: "1",
        content: "body",
      })) {
        void _chunk;
      }
    };

    await expect(consume()).rejects.toThrow("AI provider failed");
  });

  it("streamSummary throws when SSE closes unexpectedly without done event", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"chunk":"Truncated"}\n\n'));
        controller.close();
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const consume = async () => {
      for await (const _chunk of streamSummary({
        entryId: "1",
        content: "body",
      })) {
        void _chunk;
      }
    };

    await expect(consume()).rejects.toThrow(
      "Summary stream ended unexpectedly",
    );
  });
});

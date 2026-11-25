import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchTranslateArticle, BatchTranslateResult } from "@/api";
import { useTranslationStore } from "@/stores/translation-store";
import { translateArticlesBatch } from "./translation-service";

const mockStreamBatchTranslate =
  vi.fn<
    (
      articles: BatchTranslateArticle[],
      signal?: AbortSignal,
    ) => AsyncGenerator<BatchTranslateResult>
  >();

vi.mock("@/api", () => ({
  streamBatchTranslate: (
    articles: BatchTranslateArticle[],
    signal?: AbortSignal,
  ) => mockStreamBatchTranslate(articles, signal),
}));

describe("translation-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTranslationStore.getState().clearAll();
  });

  it("keeps independent AbortSignals isolated between callers", async () => {
    let releaseDetail: () => void = () => {};

    mockStreamBatchTranslate.mockImplementation(
      async function* (articles, signal) {
        if (articles[0]?.id === "list-1") {
          await new Promise<void>((_, reject) => {
            signal?.addEventListener("abort", () => {
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            });
          });
          return;
        }

        await new Promise<void>((resolve) => {
          releaseDetail = resolve;
        });
        if (!signal?.aborted) {
          yield {
            id: "detail-1",
            title: "Translated Detail",
            summary: "Detail Summary",
          };
        }
      },
    );

    const listController = new AbortController();
    const detailController = new AbortController();

    const listPromise = translateArticlesBatch(
      [{ id: "list-1", title: "List", summary: "Summary" }],
      "zh-CN",
      listController.signal,
    );
    const detailPromise = translateArticlesBatch(
      [{ id: "detail-1", title: "Detail", summary: "Summary" }],
      "zh-CN",
      detailController.signal,
    );

    // Aborting list channel must not abort detail channel
    listController.abort();
    await listPromise;

    expect(detailController.signal.aborted).toBe(false);
    releaseDetail();
    await detailPromise;

    const detailTranslation = useTranslationStore
      .getState()
      .getTranslation("detail-1", "zh-CN");
    expect(detailTranslation?.title).toBe("Translated Detail");
  });

  it("deduplicates concurrent requests for the same article id", async () => {
    let releaseBatch: () => void = () => {};

    mockStreamBatchTranslate.mockImplementation(async function* (articles) {
      await new Promise<void>((resolve) => {
        releaseBatch = resolve;
      });
      for (const a of articles) {
        yield { id: a.id, title: `Translated ${a.title}`, summary: "" };
      }
    });

    const first = translateArticlesBatch(
      [{ id: "dup-1", title: "A", summary: null }],
      "zh-CN",
    );
    const second = translateArticlesBatch(
      [{ id: "dup-1", title: "A", summary: null }],
      "zh-CN",
    );

    releaseBatch();
    await Promise.all([first, second]);

    expect(mockStreamBatchTranslate).toHaveBeenCalledTimes(1);
  });
});

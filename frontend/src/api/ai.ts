import {
  ApiError,
  authFetch,
  readNDJSONLines,
  readSSEEvents,
  request,
} from "./client";

export interface SummarizeRequest {
  entryId: string;
  content: string;
  title?: string;
  isReadability?: boolean;
}

export interface SummarizeResponse {
  summary: string;
  cached: boolean;
}

type SummarizeStreamEvent =
  { chunk: string } | { done: true } | { error: string };

export async function* streamSummary(
  req: SummarizeRequest,
  signal?: AbortSignal,
): AsyncGenerator<string | { cached: true; summary: string }> {
  const response = await authFetch("/api/ai/summarize", {
    method: "POST",
    body: JSON.stringify(req),
    signal,
  });

  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await response.json()) as SummarizeResponse;
    yield { cached: true, summary: data.summary };
    return;
  }

  for await (const event of readSSEEvents<SummarizeStreamEvent>(response)) {
    if ("error" in event) {
      throw new ApiError(event.error || "Failed to generate summary", 500);
    }
    if ("done" in event && event.done) {
      return;
    }
    if ("chunk" in event && event.chunk) {
      yield event.chunk;
    }
  }

  throw new ApiError("Summary stream ended unexpectedly", 500);
}

export interface TranslateRequest {
  entryId: string;
  content: string;
  title?: string;
  isReadability?: boolean;
}

export interface TranslateResponse {
  content: string;
  cached: boolean;
}

export interface TranslateBlockData {
  index: number;
  html: string;
  needTranslate: boolean;
}

export interface TranslateInit {
  blocks: TranslateBlockData[];
}

export interface TranslateBlockResult {
  index: number;
  html: string;
}

export interface TranslateDone {
  done: true;
}

export interface TranslateError {
  error: string;
}

export type TranslateEvent =
  TranslateInit | TranslateBlockResult | TranslateDone | TranslateError;

export function isTranslateInit(event: TranslateEvent): event is TranslateInit {
  return "blocks" in event && Array.isArray(event.blocks);
}

export function isTranslateBlockResult(
  event: TranslateEvent,
): event is TranslateBlockResult {
  return "index" in event && "html" in event && !("blocks" in event);
}

export function isTranslateDone(event: TranslateEvent): event is TranslateDone {
  return "done" in event && event.done === true;
}

export function isTranslateError(
  event: TranslateEvent,
): event is TranslateError {
  return "error" in event;
}

export async function* streamTranslateBlocks(
  req: TranslateRequest,
  signal?: AbortSignal,
): AsyncGenerator<TranslateEvent | { cached: true; content: string }> {
  const response = await authFetch("/api/ai/translate", {
    method: "POST",
    body: JSON.stringify(req),
    signal,
  });

  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await response.json()) as TranslateResponse;
    yield { cached: true, content: data.content };
    return;
  }

  yield* readSSEEvents<TranslateEvent>(response);
}

export interface BatchTranslateArticle {
  id: string;
  title: string;
  summary: string;
}

export interface BatchTranslateResult {
  id: string;
  title: string | null;
  summary: string | null;
  cached?: boolean;
}

export async function* streamBatchTranslate(
  articles: BatchTranslateArticle[],
  signal?: AbortSignal,
): AsyncGenerator<BatchTranslateResult> {
  const response = await authFetch("/api/ai/translate/batch", {
    method: "POST",
    body: JSON.stringify({ articles }),
    signal,
  });

  yield* readNDJSONLines<BatchTranslateResult>(response);
}

export interface ClearAICacheResponse {
  summaries: number;
  translations: number;
  listTranslations: number;
}

export async function clearAICache(): Promise<ClearAICacheResponse> {
  return request<ClearAICacheResponse>("/api/ai/cache", {
    method: "DELETE",
  });
}

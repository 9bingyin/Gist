import type { ApiErrorResponse } from "@/types/api";

export const API_BASE_URL = process.env.PUBLIC_API_URL ?? "";
const TOKEN_KEY = "gist_auth_token";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function isErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null) return false;
  if (!("error" in value)) return false;
  return typeof (value as { error: unknown }).error === "string";
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (isErrorResponse(data)) return data.error;
  if (typeof data === "string") return data;
  return fallback;
}

// Token management
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Callback for handling 401 errors (set by auth store)
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void): void {
  onUnauthorized = callback;
}

function buildUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

/**
 * Unified authenticated fetch that injects Bearer token and handles 401 globally.
 */
export async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = buildUrl(path);
  const headers = new Headers(options.headers);
  const body = options.body;

  if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && onUnauthorized) {
      onUnauthorized();
    }

    const data = await parseResponse(response);
    const message = extractErrorMessage(data, response.statusText);
    throw new ApiError(message || "Request failed", response.status);
  }

  return response;
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authFetch(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await parseResponse(response);
  return data as T;
}

/**
 * Read NDJSON lines from a stream.
 */
export async function* readNDJSONLines<T>(
  response: Response,
): AsyncGenerator<T> {
  if (!response.body) {
    throw new ApiError("No response body", 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReading = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        doneReading = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          try {
            yield JSON.parse(line) as T;
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer) as T;
      } catch {
        // Ignore parse errors
      }
    }
  } finally {
    if (!doneReading) {
      await reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
}

/**
 * Read SSE events from a stream.
 * Handles trailing buffer without newline and cancels reader on early exit/error.
 */
export async function* readSSEEvents<T>(response: Response): AsyncGenerator<T> {
  if (!response.body) {
    throw new ApiError("No response body", 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReading = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        doneReading = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6)) as T;
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    buffer += decoder.decode();
    if (buffer) {
      for (const rawLine of buffer.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6)) as T;
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  } finally {
    if (!doneReading) {
      await reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
}

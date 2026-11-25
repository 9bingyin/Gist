import type {
  AISettings,
  AITestRequest,
  AITestResponse,
  AppearanceSettings,
  DomainRateLimit,
  DomainRateLimitListResponse,
  GeneralSettings,
  NetworkSettings,
  NetworkTestRequest,
  NetworkTestResponse,
} from "@/types/settings";
import { request } from "./client";

export async function getAISettings(): Promise<AISettings> {
  return request<AISettings>("/api/settings/ai");
}

export async function updateAISettings(
  settings: AISettings,
): Promise<AISettings> {
  return request<AISettings>("/api/settings/ai", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function testAIConnection(
  config: AITestRequest,
): Promise<AITestResponse> {
  return request<AITestResponse>("/api/settings/ai/test", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  return request<GeneralSettings>("/api/settings/general");
}

export async function updateGeneralSettings(
  settings: GeneralSettings,
): Promise<GeneralSettings> {
  return request<GeneralSettings>("/api/settings/general", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getNetworkSettings(): Promise<NetworkSettings> {
  return request<NetworkSettings>("/api/settings/network");
}

export async function updateNetworkSettings(
  settings: NetworkSettings,
): Promise<NetworkSettings> {
  return request<NetworkSettings>("/api/settings/network", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getAppearanceSettings(): Promise<AppearanceSettings> {
  return request<AppearanceSettings>("/api/settings/appearance");
}

export async function updateAppearanceSettings(
  settings: AppearanceSettings,
): Promise<AppearanceSettings> {
  return request<AppearanceSettings>("/api/settings/appearance", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function testNetworkProxy(
  config: NetworkTestRequest,
): Promise<NetworkTestResponse> {
  return request<NetworkTestResponse>("/api/settings/network/test", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export interface ClearCacheResponse {
  deleted: number;
}

export async function clearAnubisCookies(): Promise<ClearCacheResponse> {
  return request<ClearCacheResponse>("/api/settings/anubis-cookies", {
    method: "DELETE",
  });
}

export async function clearIconCache(): Promise<ClearCacheResponse> {
  return request<ClearCacheResponse>("/api/icons/cache", {
    method: "DELETE",
  });
}

export async function clearReadabilityCache(): Promise<ClearCacheResponse> {
  return request<ClearCacheResponse>("/api/entries/readability-cache", {
    method: "DELETE",
  });
}

export async function clearEntryCache(): Promise<ClearCacheResponse> {
  return request<ClearCacheResponse>("/api/entries/cache", {
    method: "DELETE",
  });
}

export async function getDomainRateLimits(): Promise<DomainRateLimitListResponse> {
  return request<DomainRateLimitListResponse>("/api/domain-rate-limits");
}

export async function createDomainRateLimit(
  host: string,
  intervalSeconds: number,
): Promise<DomainRateLimit> {
  return request<DomainRateLimit>("/api/domain-rate-limits", {
    method: "POST",
    body: JSON.stringify({ host, intervalSeconds }),
  });
}

export async function updateDomainRateLimit(
  host: string,
  intervalSeconds: number,
): Promise<DomainRateLimit> {
  return request<DomainRateLimit>(
    `/api/domain-rate-limits/${encodeURIComponent(host)}`,
    {
      method: "PUT",
      body: JSON.stringify({ intervalSeconds }),
    },
  );
}

export async function deleteDomainRateLimit(host: string): Promise<void> {
  return request<void>(`/api/domain-rate-limits/${encodeURIComponent(host)}`, {
    method: "DELETE",
  });
}

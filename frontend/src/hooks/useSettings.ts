import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDomainRateLimit,
  deleteDomainRateLimit,
  getAISettings,
  getAppearanceSettings,
  getDomainRateLimits,
  getGeneralSettings,
  getNetworkSettings,
  updateAISettings,
  updateAppearanceSettings,
  updateDomainRateLimit,
  updateGeneralSettings,
  updateNetworkSettings,
} from "@/api";
import type {
  AISettings,
  AppearanceSettings,
  GeneralSettings,
  NetworkSettings,
} from "@/types/settings";

const SETTINGS_STALE_TIME = 5 * 60 * 1000;

export function useAISettings() {
  return useQuery({
    queryKey: ["aiSettings"],
    queryFn: getAISettings,
    staleTime: SETTINGS_STALE_TIME,
  });
}

export function useUpdateAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: AISettings) => updateAISettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(["aiSettings"], saved);
      queryClient.invalidateQueries({ queryKey: ["aiSettings"] });
    },
  });
}

export function useGeneralSettings() {
  return useQuery({
    queryKey: ["generalSettings"],
    queryFn: getGeneralSettings,
    staleTime: SETTINGS_STALE_TIME,
  });
}

export function useUpdateGeneralSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: GeneralSettings) => updateGeneralSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(["generalSettings"], saved);
      queryClient.invalidateQueries({ queryKey: ["generalSettings"] });
    },
  });
}

export function useAppearanceSettings() {
  return useQuery({
    queryKey: ["appearanceSettings"],
    queryFn: getAppearanceSettings,
    staleTime: SETTINGS_STALE_TIME,
  });
}

export function useUpdateAppearanceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: AppearanceSettings) =>
      updateAppearanceSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(["appearanceSettings"], saved);
      queryClient.invalidateQueries({ queryKey: ["appearanceSettings"] });
    },
  });
}

export function useNetworkSettings() {
  return useQuery({
    queryKey: ["networkSettings"],
    queryFn: getNetworkSettings,
    staleTime: SETTINGS_STALE_TIME,
  });
}

export function useUpdateNetworkSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: NetworkSettings) => updateNetworkSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(["networkSettings"], saved);
      queryClient.invalidateQueries({ queryKey: ["networkSettings"] });
    },
  });
}

export function useDomainRateLimits() {
  return useQuery({
    queryKey: ["domainRateLimits"],
    queryFn: getDomainRateLimits,
  });
}

export function useCreateDomainRateLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      host,
      intervalSeconds,
    }: {
      host: string;
      intervalSeconds: number;
    }) => createDomainRateLimit(host, intervalSeconds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domainRateLimits"] });
    },
  });
}

export function useUpdateDomainRateLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      host,
      intervalSeconds,
    }: {
      host: string;
      intervalSeconds: number;
    }) => updateDomainRateLimit(host, intervalSeconds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domainRateLimits"] });
    },
  });
}

export function useDeleteDomainRateLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (host: string) => deleteDomainRateLimit(host),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domainRateLimits"] });
    },
  });
}

import type { ContentType } from './api'

export type AIProvider = 'openai' | 'anthropic' | 'compatible';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'minimal' | 'none' | '';

export type OpenAIEndpoint = 'responses' | 'chat/completions';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  endpoint: OpenAIEndpoint;
  thinking: boolean;
  thinkingBudget: number;
  reasoningEffort: ReasoningEffort;
  summaryLanguage: string;
  autoTranslate: boolean;
  autoSummary: boolean;
  rateLimit: number;
}

export interface AITestRequest {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  endpoint: OpenAIEndpoint;
  thinking: boolean;
  thinkingBudget: number;
  reasoningEffort: ReasoningEffort;
}

export interface AITestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface GeneralSettings {
  fallbackUserAgent: string;
  autoReadability: boolean;
}

export type ProxyType = 'http' | 'socks5';

export type IPStack = 'default' | 'ipv4' | 'ipv6';

export interface NetworkSettings {
  enabled: boolean;
  type: ProxyType;
  host: string;
  port: number;
  username: string;
  password: string;
  ipStack: IPStack;
}

export interface NetworkTestRequest {
  enabled: boolean;
  type: ProxyType;
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface NetworkTestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface DomainRateLimit {
  id: string;
  host: string;
  intervalSeconds: number;
}

export interface DomainRateLimitListResponse {
  items: DomainRateLimit[];
}

export interface AppearanceSettings {
  contentTypes: ContentType[];
}

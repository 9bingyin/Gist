export type AIProvider = 'openai' | 'anthropic' | 'compatible';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'minimal' | 'none' | '';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  thinking: boolean;
  thinkingBudget: number;
  reasoningEffort: ReasoningEffort;
  summaryLanguage: string;
  autoTranslate: boolean;
  autoSummary: boolean;
}

export interface AITestRequest {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  thinking: boolean;
  thinkingBudget: number;
  reasoningEffort: ReasoningEffort;
}

export interface AITestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

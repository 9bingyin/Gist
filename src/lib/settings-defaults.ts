/**
 * Default settings - single source of truth for all default values
 */

export const DEFAULT_SETTINGS: Record<string, string> = {
  // AI Settings
  aiProvider: "openai",
  aiLanguage: "English",
  aiThinking: "false",
  aiThinkingEffort: "medium",
  aiAutoTranslate: "false",
  aiEnabled: "true",

  // Reading Settings
  alwaysReadability: "false",
  alwaysSummary: "false",
};

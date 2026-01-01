import { useEffect, useState } from 'react'
import { getAISettings, updateAISettings, testAIConnection, ApiError } from '@/api'
import { cn } from '@/lib/utils'
import type { AIProvider, AISettings as AISettingsType, ReasoningEffort } from '@/types/settings'

const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'compatible', label: 'OpenAI Compatible' },
]

// OpenAI reasoning effort options (full range)
const OPENAI_EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: 'xhigh', label: 'Extra High' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'none', label: 'None (gpt-5.1 only)' },
]

// Compatible (OpenRouter) effort options (full range)
const COMPATIBLE_EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: 'xhigh', label: 'Extra High (95%)' },
  { value: 'high', label: 'High (80%)' },
  { value: 'medium', label: 'Medium (50%)' },
  { value: 'low', label: 'Low (20%)' },
  { value: 'minimal', label: 'Minimal (10%)' },
  { value: 'none', label: 'None' },
]

// Summary language options
const SUMMARY_LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: 'Chinese (Traditional)' },
  { value: 'en-US', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
]

export function AISettings() {
  const [settings, setSettings] = useState<AISettingsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getAISettings()
      setSettings(data)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load settings')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (field: keyof AISettingsType, value: string | boolean | number) => {
    if (!settings) return
    setSettings({ ...settings, [field]: value })
    setSuccessMessage(null)
    setTestResult(null)
  }

  const handleMultiChange = (changes: Partial<AISettingsType>) => {
    if (!settings) return
    setSettings({ ...settings, ...changes })
    setSuccessMessage(null)
    setTestResult(null)
  }

  const handleTest = async () => {
    if (!settings) return

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testAIConnection({
        provider: settings.provider,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        thinking: settings.thinking,
        thinkingBudget: settings.thinkingBudget,
        reasoningEffort: settings.reasoningEffort,
      })
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Test failed',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return

    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await updateAISettings(settings)
      setSuccessMessage('Settings saved successfully')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to save settings')
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error || 'Failed to load settings'}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Provider */}
      <div>
        <label className="block text-sm font-medium mb-2">Provider</label>
        <select
          value={settings.provider}
          onChange={(e) => handleChange('provider', e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium mb-2">API Key</label>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => handleChange('apiKey', e.target.value)}
          placeholder={
            settings.provider === 'openai'
              ? 'sk-...'
              : settings.provider === 'anthropic'
                ? 'sk-ant-...'
                : 'Enter API Key'
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Base URL
          {settings.provider === 'compatible' && (
            <span className="text-destructive ml-1">*</span>
          )}
          {settings.provider !== 'compatible' && (
            <span className="text-muted-foreground font-normal ml-2">(Optional)</span>
          )}
        </label>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={(e) => handleChange('baseUrl', e.target.value)}
          placeholder={
            settings.provider === 'compatible'
              ? 'https://openrouter.ai/api/v1'
              : 'Leave empty for default'
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Model */}
      <div>
        <label className="block text-sm font-medium mb-2">Model</label>
        <input
          type="text"
          value={settings.model}
          onChange={(e) => handleChange('model', e.target.value)}
          placeholder={
            settings.provider === 'openai'
              ? 'gpt-4o'
              : settings.provider === 'anthropic'
                ? 'claude-sonnet-4-20250514'
                : 'e.g. anthropic/claude-3.5-sonnet'
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Reasoning/Thinking Settings - Provider Specific */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="thinking"
            checked={settings.thinking}
            onChange={(e) => handleChange('thinking', e.target.checked)}
            className="size-4 rounded border-border"
          />
          <label htmlFor="thinking" className="text-sm font-medium">
            {settings.provider === 'anthropic' ? 'Extended Thinking' : 'Enable Reasoning'}
          </label>
          {settings.provider === 'openai' && (
            <span className="text-xs text-muted-foreground">(o1/o3/o4/gpt-5 series)</span>
          )}
        </div>

        {/* OpenAI: Reasoning Effort dropdown */}
        {settings.thinking && settings.provider === 'openai' && (
          <div className="ml-6">
            <label className="block text-sm font-medium mb-2">Reasoning Effort</label>
            <select
              value={settings.reasoningEffort}
              onChange={(e) => handleChange('reasoningEffort', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {OPENAI_EFFORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Anthropic: Thinking Budget input */}
        {settings.thinking && settings.provider === 'anthropic' && (
          <div className="ml-6">
            <label className="block text-sm font-medium mb-2">Thinking Budget (tokens)</label>
            <input
              type="number"
              value={settings.thinkingBudget}
              onChange={(e) => handleChange('thinkingBudget', parseInt(e.target.value) || 0)}
              min={1024}
              max={128000}
              placeholder="10000"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <p className="text-xs text-muted-foreground mt-1">Range: 1024 - 128000 tokens</p>
          </div>
        )}

        {/* Compatible: Both options (mutually exclusive) */}
        {settings.thinking && settings.provider === 'compatible' && (
          <div className="ml-6 space-y-4">
            {/* Effort option */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="compatible-effort"
                  name="compatible-mode"
                  checked={settings.reasoningEffort !== ''}
                  onChange={() => handleMultiChange({ reasoningEffort: 'medium', thinkingBudget: 0 })}
                  className="size-4"
                />
                <label htmlFor="compatible-effort" className="text-sm font-medium">
                  Reasoning Effort
                </label>
                <span className="text-xs text-muted-foreground">(o1/Grok models)</span>
              </div>
              {settings.reasoningEffort !== '' && (
                <select
                  value={settings.reasoningEffort}
                  onChange={(e) => handleChange('reasoningEffort', e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {COMPATIBLE_EFFORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Budget option */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="compatible-budget"
                  name="compatible-mode"
                  checked={settings.reasoningEffort === '' && settings.thinkingBudget > 0}
                  onChange={() => handleMultiChange({ reasoningEffort: '', thinkingBudget: 10000 })}
                  className="size-4"
                />
                <label htmlFor="compatible-budget" className="text-sm font-medium">
                  Thinking Budget
                </label>
                <span className="text-xs text-muted-foreground">(Anthropic/Gemini models)</span>
              </div>
              {settings.reasoningEffort === '' && settings.thinkingBudget > 0 && (
                <input
                  type="number"
                  value={settings.thinkingBudget}
                  onChange={(e) => handleChange('thinkingBudget', parseInt(e.target.value) || 0)}
                  min={1024}
                  max={128000}
                  placeholder="10000"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary Language */}
      <div>
        <label className="block text-sm font-medium mb-2">Summary Language</label>
        <select
          value={settings.summaryLanguage}
          onChange={(e) => handleChange('summaryLanguage', e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {SUMMARY_LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          The language used for AI-generated summaries and translations
        </p>
      </div>

      {/* Auto Translate */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="autoTranslate"
          checked={settings.autoTranslate}
          onChange={(e) => handleChange('autoTranslate', e.target.checked)}
          className="size-4 rounded border-border"
        />
        <label htmlFor="autoTranslate" className="text-sm font-medium">
          Auto Translate
        </label>
      </div>
      <p className="text-xs text-muted-foreground -mt-4 ml-6">
        Automatically translate articles that are not in your target language
      </p>

      {/* Auto Summary */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="autoSummary"
          checked={settings.autoSummary}
          onChange={(e) => handleChange('autoSummary', e.target.checked)}
          className="size-4 rounded border-border"
        />
        <label htmlFor="autoSummary" className="text-sm font-medium">
          Auto Summary
        </label>
      </div>
      <p className="text-xs text-muted-foreground -mt-4 ml-6">
        Automatically generate AI summary when viewing articles
      </p>

      {/* Rate Limit */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Rate Limit (QPS)
        </label>
        <input
          type="number"
          value={settings.rateLimit}
          onChange={(e) => handleChange('rateLimit', parseInt(e.target.value) || 10)}
          min={1}
          max={100}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Maximum API requests per second (1-100, default: 10)
        </p>
      </div>

      {/* Test & Save Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting || !settings.apiKey || !settings.model || (settings.provider === 'compatible' && !settings.baseUrl)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            'bg-muted hover:bg-muted/80',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {isTesting ? (
            <>
              <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>Testing...</span>
            </>
          ) : (
            <>
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>Test</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {isSaving ? (
            <>
              <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Save</span>
          )}
        </button>

        {testResult && (
          <span
            className={cn(
              'text-sm',
              testResult.success ? 'text-green-600' : 'text-destructive'
            )}
          >
            {testResult.success ? 'Connection successful!' : testResult.error}
          </span>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {successMessage && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600">
          {successMessage}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAISettings, updateAISettings, testAIConnection, ApiError } from '@/api'
import { cn } from '@/lib/utils'
import type { AIProvider, AISettings as AISettingsType, ReasoningEffort } from '@/types/settings'

export function AISettings() {
  const { t } = useTranslation()

  const PROVIDERS: { value: AIProvider; label: string }[] = useMemo(
    () => [
      { value: 'openai', label: t('ai_settings.provider_openai') },
      { value: 'anthropic', label: t('ai_settings.provider_anthropic') },
      { value: 'compatible', label: t('ai_settings.provider_compatible') },
    ],
    [t]
  )

  // OpenAI reasoning effort options (full range)
  const OPENAI_EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = useMemo(
    () => [
      { value: 'xhigh', label: t('ai_settings.effort_xhigh') },
      { value: 'high', label: t('ai_settings.effort_high') },
      { value: 'medium', label: t('ai_settings.effort_medium') },
      { value: 'low', label: t('ai_settings.effort_low') },
      { value: 'minimal', label: t('ai_settings.effort_minimal') },
      { value: 'none', label: t('ai_settings.effort_none_gpt5') },
    ],
    [t]
  )

  // Compatible (OpenRouter) effort options (full range)
  const COMPATIBLE_EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = useMemo(
    () => [
      { value: 'xhigh', label: t('ai_settings.effort_xhigh_percent') },
      { value: 'high', label: t('ai_settings.effort_high_percent') },
      { value: 'medium', label: t('ai_settings.effort_medium_percent') },
      { value: 'low', label: t('ai_settings.effort_low_percent') },
      { value: 'minimal', label: t('ai_settings.effort_minimal_percent') },
      { value: 'none', label: t('ai_settings.effort_none') },
    ],
    [t]
  )

  // Summary language options
  const SUMMARY_LANGUAGE_OPTIONS: { value: string; label: string }[] = useMemo(
    () => [
      { value: 'zh-CN', label: t('ai_settings.lang_zh_cn') },
      { value: 'zh-TW', label: t('ai_settings.lang_zh_tw') },
      { value: 'en-US', label: t('ai_settings.lang_en') },
      { value: 'ja', label: t('ai_settings.lang_ja') },
      { value: 'ko', label: t('ai_settings.lang_ko') },
      { value: 'es', label: t('ai_settings.lang_es') },
      { value: 'fr', label: t('ai_settings.lang_fr') },
      { value: 'de', label: t('ai_settings.lang_de') },
    ],
    [t]
  )
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
        setError(t('ai_settings.failed_to_load'))
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
      setSuccessMessage(t('ai_settings.settings_saved'))
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(t('ai_settings.failed_to_save'))
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
        {error || t('ai_settings.failed_to_load')}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Provider */}
      <div>
        <label className="block text-sm font-medium mb-2">{t('ai_settings.provider')}</label>
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
        <label className="block text-sm font-medium mb-2">{t('ai_settings.api_key')}</label>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => handleChange('apiKey', e.target.value)}
          placeholder={
            settings.provider === 'openai'
              ? 'sk-...'
              : settings.provider === 'anthropic'
                ? 'sk-ant-...'
                : t('ai_settings.enter_api_key')
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-sm font-medium mb-2">
          {t('ai_settings.base_url')}
          {settings.provider === 'compatible' && (
            <span className="text-destructive ml-1">{t('ai_settings.required')}</span>
          )}
          {settings.provider !== 'compatible' && (
            <span className="text-muted-foreground font-normal ml-2">{t('ai_settings.optional')}</span>
          )}
        </label>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={(e) => handleChange('baseUrl', e.target.value)}
          placeholder={
            settings.provider === 'compatible'
              ? 'https://openrouter.ai/api/v1'
              : t('ai_settings.leave_empty_for_default')
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Model */}
      <div>
        <label className="block text-sm font-medium mb-2">{t('ai_settings.model')}</label>
        <input
          type="text"
          value={settings.model}
          onChange={(e) => handleChange('model', e.target.value)}
          placeholder={
            settings.provider === 'openai'
              ? 'gpt-4o'
              : settings.provider === 'anthropic'
                ? 'claude-sonnet-4-20250514'
                : t('ai_settings.model_example', { example: 'anthropic/claude-3.5-sonnet' })
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
            {settings.provider === 'anthropic' ? t('ai_settings.extended_thinking') : t('ai_settings.enable_reasoning')}
          </label>
          {settings.provider === 'openai' && (
            <span className="text-xs text-muted-foreground">{t('ai_settings.o1_series')}</span>
          )}
        </div>

        {/* OpenAI: Reasoning Effort dropdown */}
        {settings.thinking && settings.provider === 'openai' && (
          <div className="ml-6">
            <label className="block text-sm font-medium mb-2">{t('ai_settings.reasoning_effort_label')}</label>
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
            <label className="block text-sm font-medium mb-2">{t('ai_settings.thinking_budget_label')}</label>
            <input
              type="number"
              value={settings.thinkingBudget}
              onChange={(e) => handleChange('thinkingBudget', parseInt(e.target.value) || 0)}
              min={1024}
              max={128000}
              placeholder="10000"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('ai_settings.thinking_budget_hint')}</p>
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
        <label className="block text-sm font-medium mb-2">{t('ai_settings.summary_language')}</label>
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
          {t('ai_settings.summary_language_hint')}
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
          {t('ai_settings.auto_translate')}
        </label>
      </div>
      <p className="text-xs text-muted-foreground -mt-4 ml-6">
        {t('ai_settings.auto_translate_hint')}
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
          {t('ai_settings.auto_summary')}
        </label>
      </div>
      <p className="text-xs text-muted-foreground -mt-4 ml-6">
        {t('ai_settings.auto_summary_hint')}
      </p>

      {/* Rate Limit */}
      <div>
        <label className="block text-sm font-medium mb-2">
          {t('ai_settings.rate_limit_label')}
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
          {t('ai_settings.rate_limit_hint')}
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
              <span>{t('ai_settings.testing')}</span>
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
              <span>{t('ai_settings.test')}</span>
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
              <span>{t('ai_settings.saving')}</span>
            </>
          ) : (
            <span>{t('ai_settings.save')}</span>
          )}
        </button>

        {testResult && (
          <span
            className={cn(
              'text-sm',
              testResult.success ? 'text-green-600 dark:text-green-400' : 'text-destructive'
            )}
          >
            {testResult.success ? t('ai_settings.test_success') + '!' : testResult.error}
          </span>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {successMessage && (
        <div className="rounded-md bg-green-500/10 dark:bg-green-500/20 px-3 py-2 text-sm text-green-600 dark:text-green-400">
          {successMessage}
        </div>
      )}
    </div>
  )
}

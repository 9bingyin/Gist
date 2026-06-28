import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAISettings, updateAISettings, testAIConnection, ApiError } from '@/api'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import type { AIProvider, AISettings as AISettingsType, RequestOptions } from '@/types/settings'

function formatRequestOptions(value: RequestOptions | null | undefined): string {
  if (!value || Object.keys(value).length === 0) return ''
  return JSON.stringify(value, null, 2)
}

function parseRequestOptions(value: string): { ok: true; value: RequestOptions } | { ok: false; error: string } {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: {} }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'request options must be a JSON object' }
    }
    return { ok: true, value: parsed as RequestOptions }
  } catch {
    return { ok: false, error: 'invalid JSON' }
  }
}

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
  const [requestOptionsText, setRequestOptionsText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)
  const isBaseURLRequired = settings
    ? settings.provider === 'openai' || settings.provider === 'compatible'
    : false
  const hasBaseURL = settings ? settings.baseUrl.trim().length > 0 : false
  const requestOptionsResult = useMemo(() => parseRequestOptions(requestOptionsText), [requestOptionsText])
  const requestOptionsError = requestOptionsResult.ok ? null : t('ai_settings.request_options_invalid')

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSettings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getAISettings()
      setSettings(data)
      setRequestOptionsText(formatRequestOptions(data.requestOptions))
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

  const handleChange = (field: keyof AISettingsType, value: string | boolean | number | RequestOptions) => {
    if (!settings) return
    setSettings({ ...settings, [field]: value } as AISettingsType)
    setSuccessMessage(null)
    setTestResult(null)
  }

  const buildSettingsPayload = (): AISettingsType | null => {
    if (!settings || !requestOptionsResult.ok) return null
    return { ...settings, requestOptions: requestOptionsResult.value }
  }

  const handleTest = async () => {
    const payload = buildSettingsPayload()
    if (!payload) return
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testAIConnection({
        provider: payload.provider,
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        model: payload.model,
        requestOptions: payload.requestOptions,
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
    const payload = buildSettingsPayload()
    if (!payload) return
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const saved = await updateAISettings(payload)
      setSettings(saved)
      setRequestOptionsText(formatRequestOptions(saved.requestOptions))
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

  const selectClass = 'h-9 w-full sm:w-48 rounded-md border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none'
  const inputClass = 'h-9 w-full sm:w-48 rounded-md border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none'
  const canSubmit = Boolean(settings.apiKey && settings.model && (!isBaseURLRequired || hasBaseURL) && !requestOptionsError)

  return (
    <div className="space-y-1">
      {/* Provider */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="text-sm font-medium">{t('ai_settings.provider')}</span>
        <select
          value={settings.provider}
          onChange={(e) => handleChange('provider', e.target.value)}
          className={cn(selectClass, 'shrink-0')}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* API Key */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="text-sm font-medium">{t('ai_settings.api_key')}</span>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => handleChange('apiKey', e.target.value)}
          placeholder={
            settings.provider === 'openai' ? 'sk-...' :
            settings.provider === 'anthropic' ? 'sk-ant-...' :
            t('ai_settings.enter_api_key')
          }
          className={cn(inputClass, 'shrink-0')}
        />
      </div>

      {/* Base URL */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-sm font-medium">{t('ai_settings.base_url')}</span>
          {isBaseURLRequired ? (
            <span className="text-xs text-destructive">{t('ai_settings.required')}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{t('ai_settings.optional')}</span>
          )}
        </div>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={(e) => handleChange('baseUrl', e.target.value)}
          placeholder={
            settings.provider === 'compatible' ? 'https://openrouter.ai/api/v1' :
            settings.provider === 'openai' ? 'https://api.openai.com/v1' :
            t('ai_settings.leave_empty_for_default')
          }
          className={cn(inputClass, 'shrink-0')}
        />
      </div>

      {/* Model */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="text-sm font-medium">{t('ai_settings.model')}</span>
        <input
          type="text"
          value={settings.model}
          onChange={(e) => handleChange('model', e.target.value)}
          placeholder={
            settings.provider === 'openai' ? 'gpt-4o' :
            settings.provider === 'anthropic' ? 'claude-sonnet-4-20250514' :
            t('ai_settings.model_example', { example: 'anthropic/claude-3.5-sonnet' })
          }
          className={cn(inputClass, 'shrink-0')}
        />
      </div>


      <div className="space-y-2 py-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{t('ai_settings.request_options')}</span>
          <p className="text-xs text-muted-foreground">{t('ai_settings.request_options_hint')}</p>
        </div>
        <textarea
          value={requestOptionsText}
          onChange={(e) => {
            setRequestOptionsText(e.target.value)
            setSuccessMessage(null)
            setTestResult(null)
          }}
          placeholder={JSON.stringify({ key: 'value' }, null, 2)}
          className={cn(
            'min-h-32 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none',
            requestOptionsError ? 'border-destructive' : 'border-border'
          )}
          spellCheck={false}
        />
        {requestOptionsError && <p className="text-xs text-destructive">{requestOptionsError}</p>}
      </div>

      {/* AI Behavior Section */}
      <div className="pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        AI
      </div>

      {/* Summary Language */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{t('ai_settings.summary_language')}</span>
          <p className="text-xs text-muted-foreground">{t('ai_settings.summary_language_hint')}</p>
        </div>
        <select
          value={settings.summaryLanguage}
          onChange={(e) => handleChange('summaryLanguage', e.target.value)}
          className={cn(selectClass, 'w-40 shrink-0')}
        >
          {SUMMARY_LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Auto Translate */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{t('ai_settings.auto_translate')}</span>
          <p className="text-xs text-muted-foreground">{t('ai_settings.auto_translate_hint')}</p>
        </div>
        <Switch
          checked={settings.autoTranslate}
          onCheckedChange={(checked) => handleChange('autoTranslate', checked)}
          className="shrink-0"
        />
      </div>

      {/* Auto Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{t('ai_settings.auto_summary')}</span>
          <p className="text-xs text-muted-foreground">{t('ai_settings.auto_summary_hint')}</p>
        </div>
        <Switch
          checked={settings.autoSummary}
          onCheckedChange={(checked) => handleChange('autoSummary', checked)}
          className="shrink-0"
        />
      </div>

      {/* Rate Limit */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{t('ai_settings.rate_limit_label')}</span>
          <p className="text-xs text-muted-foreground">{t('ai_settings.rate_limit_hint')}</p>
        </div>
        <input
          type="number"
          value={settings.rateLimit}
          onChange={(e) => handleChange('rateLimit', parseInt(e.target.value) || 10)}
          min={1}
          max={100}
          className={cn(inputClass, 'w-20 shrink-0')}
        />
      </div>

      {/* Test & Save Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-4">
        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting || !canSubmit}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors',
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>{t('ai_settings.test')}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !canSubmit}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors',
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
          <span className={cn('text-sm', testResult.success ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
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

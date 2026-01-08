import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getNetworkSettings, updateNetworkSettings, testNetworkProxy } from '@/api'
import type { NetworkSettings as NetworkSettingsType, ProxyType } from '@/types/settings'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { SegmentedControl } from '@/components/ui/segmented-control'

export function NetworkSettings() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<NetworkSettingsType>({
    enabled: false,
    type: 'http',
    host: '',
    port: 0,
    username: '',
    password: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  useEffect(() => {
    getNetworkSettings().then((data) => {
      setSettings(data)
    }).catch(() => {
      // ignore
    })
  }, [])

  const handleEnabledChange = async (checked: boolean) => {
    const newSettings = { ...settings, enabled: checked }
    setSettings(newSettings)
    try {
      await updateNetworkSettings(newSettings)
    } catch {
      // Revert on error
      setSettings(settings)
    }
  }

  const handleTypeChange = (type: ProxyType) => {
    setSettings({ ...settings, type })
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      await updateNetworkSettings(settings)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestStatus('idle')
    setTestMessage('')
    try {
      const result = await testNetworkProxy(settings)
      if (result.success) {
        setTestStatus('success')
        setTestMessage(result.message || t('settings.proxy_test_success'))
      } else {
        setTestStatus('error')
        setTestMessage(result.error || t('settings.proxy_test_failed'))
      }
    } catch (err) {
      setTestStatus('error')
      setTestMessage(err instanceof Error ? err.message : t('settings.proxy_test_failed'))
    } finally {
      setIsTesting(false)
      setTimeout(() => {
        setTestStatus('idle')
        setTestMessage('')
      }, 3000)
    }
  }

  const proxyTypeOptions = useMemo(() => [
    { value: 'http' as ProxyType, label: 'HTTP' },
    { value: 'socks5' as ProxyType, label: 'SOCKS5' },
  ], [])

  const canTest = settings.host && settings.port > 0

  return (
    <div className="space-y-6">
      {/* Enable Proxy */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{t('settings.proxy_enabled')}</div>
            <div className="text-xs text-muted-foreground">{t('settings.proxy_enabled_description')}</div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={handleEnabledChange}
          />
        </div>
      </section>

      {/* Proxy Configuration */}
      <section className={cn(!settings.enabled && 'opacity-50 pointer-events-none')}>
        <div className="space-y-4">
          {/* Proxy Type */}
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{t('settings.proxy_type')}</div>
            <SegmentedControl
              value={settings.type}
              onValueChange={handleTypeChange}
              options={proxyTypeOptions}
            />
          </div>

          {/* Host and Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium">{t('settings.proxy_host')}</label>
              <input
                type="text"
                value={settings.host}
                onChange={(e) => setSettings({ ...settings, host: e.target.value })}
                placeholder="127.0.0.1"
                className={cn(
                  'mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm',
                  'placeholder:text-muted-foreground/50',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                )}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('settings.proxy_port')}</label>
              <input
                type="number"
                value={settings.port || ''}
                onChange={(e) => setSettings({ ...settings, port: parseInt(e.target.value, 10) || 0 })}
                placeholder="7890"
                className={cn(
                  'mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm',
                  'placeholder:text-muted-foreground/50',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                )}
              />
            </div>
          </div>

          {/* Authentication */}
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('settings.proxy_auth')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('settings.proxy_username')}</label>
                <input
                  type="text"
                  value={settings.username}
                  onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                  className={cn(
                    'mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm',
                    'placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                  )}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.proxy_password')}</label>
                <input
                  type="password"
                  value={settings.password}
                  onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                  className={cn(
                    'mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm',
                    'placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                  )}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || !canTest}
              className={cn(
                'h-9 rounded-md px-4 text-sm font-medium transition-colors',
                'border border-border bg-background hover:bg-accent',
                'disabled:cursor-not-allowed disabled:opacity-50',
                testStatus === 'success' && 'border-green-600 text-green-600',
                testStatus === 'error' && 'border-destructive text-destructive'
              )}
            >
              {isTesting ? t('settings.proxy_testing') : t('settings.proxy_test')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={cn(
                'h-9 rounded-md px-4 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
                saveStatus === 'success' && 'bg-green-600 hover:bg-green-600',
                saveStatus === 'error' && 'bg-destructive hover:bg-destructive'
              )}
            >
              {isSaving ? t('settings.saving') : saveStatus === 'success' ? t('settings.saved') : t('settings.save')}
            </button>
            {testMessage && (
              <span className={cn(
                'text-sm',
                testStatus === 'success' && 'text-green-600',
                testStatus === 'error' && 'text-destructive'
              )}>
                {testMessage}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { testNetworkProxy, ApiError } from "@/api";
import {
  useNetworkSettings,
  useUpdateNetworkSettings,
} from "@/hooks/useSettings";
import type {
  NetworkSettings as NetworkSettingsType,
  ProxyType,
  IPStack,
} from "@/types/settings";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";

const defaultNetworkSettings: NetworkSettingsType = {
  enabled: false,
  type: "http",
  host: "",
  port: 0,
  username: "",
  password: "",
  ipStack: "default",
};

export function NetworkSettings() {
  const { t } = useTranslation();
  const {
    data: serverSettings,
    isLoading,
    error: loadError,
  } = useNetworkSettings();
  const updateNetworkMutation = useUpdateNetworkSettings();

  const [settings, setSettings] = useState<NetworkSettingsType>(
    defaultNetworkSettings,
  );
  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [testMessage, setTestMessage] = useState("");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (serverSettings) {
      setSettings(serverSettings);
    }
  }, [serverSettings]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (testTimerRef.current) clearTimeout(testTimerRef.current);
    };
  }, []);

  const handleEnabledChange = async (checked: boolean) => {
    const previous = settings;
    const newSettings = { ...settings, enabled: checked };
    setSettings(newSettings);
    setSaveError(null);
    try {
      await updateNetworkMutation.mutateAsync(newSettings);
    } catch (err) {
      setSettings(previous);
      setSaveError(
        err instanceof Error ? err.message : t("ai_settings.failed_to_save"),
      );
    }
  };

  const handleTypeChange = (type: ProxyType) => {
    setSettings({ ...settings, type });
  };

  const handleIPStackChange = async (ipStack: IPStack) => {
    const previous = settings;
    const newSettings = { ...settings, ipStack };
    setSettings(newSettings);
    setSaveError(null);
    try {
      await updateNetworkMutation.mutateAsync(newSettings);
    } catch (err) {
      setSettings(previous);
      setSaveError(
        err instanceof Error ? err.message : t("ai_settings.failed_to_save"),
      );
    }
  };

  const handleSave = async () => {
    setSaveStatus("idle");
    setSaveError(null);
    try {
      const saved = await updateNetworkMutation.mutateAsync(settings);
      setSettings(saved);
      setSaveStatus("success");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(
        err instanceof ApiError ? err.message : t("ai_settings.failed_to_save"),
      );
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestStatus("idle");
    setTestMessage("");
    try {
      const result = await testNetworkProxy(settings);
      if (result.success) {
        setTestStatus("success");
        setTestMessage(result.message || t("settings.proxy_test_success"));
      } else {
        setTestStatus("error");
        setTestMessage(result.error || t("settings.proxy_test_failed"));
      }
    } catch (err) {
      setTestStatus("error");
      setTestMessage(
        err instanceof Error ? err.message : t("settings.proxy_test_failed"),
      );
    } finally {
      setIsTesting(false);
      if (testTimerRef.current) clearTimeout(testTimerRef.current);
      testTimerRef.current = setTimeout(() => {
        setTestStatus("idle");
        setTestMessage("");
      }, 3000);
    }
  };

  const proxyTypeOptions = useMemo(
    () => [
      { value: "http" as ProxyType, label: "HTTP" },
      { value: "socks5" as ProxyType, label: "SOCKS5" },
    ],
    [],
  );

  const ipStackOptions = useMemo(
    () => [
      { value: "default" as IPStack, label: t("settings.ip_stack_default") },
      { value: "ipv4" as IPStack, label: t("settings.ip_stack_ipv4") },
      { value: "ipv6" as IPStack, label: t("settings.ip_stack_ipv6") },
    ],
    [t],
  );

  if (isLoading && !serverSettings) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const canTest = Boolean(settings.host && settings.port > 0);
  const isSaving = updateNetworkMutation.isPending;

  return (
    <div className="space-y-6">
      {(loadError || saveError) && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError ||
            (loadError instanceof Error
              ? loadError.message
              : t("ai_settings.failed_to_load"))}
        </div>
      )}

      {/* IP Stack */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t("settings.ip_stack")}</div>
            <div className="text-xs text-muted-foreground">
              {t("settings.ip_stack_description")}
            </div>
          </div>
          <SegmentedControl
            className="shrink-0"
            value={settings.ipStack}
            onValueChange={handleIPStackChange}
            options={ipStackOptions}
          />
        </div>
      </section>

      {/* Enable Proxy */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {t("settings.proxy_enabled")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("settings.proxy_enabled_description")}
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={handleEnabledChange}
          />
        </div>
      </section>

      {/* Proxy Configuration */}
      <fieldset
        disabled={!settings.enabled}
        className={cn(!settings.enabled && "opacity-50")}
      >
        <div className="space-y-4">
          {/* Proxy Type */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {t("settings.proxy_type")}
            </div>
            <SegmentedControl
              className="shrink-0"
              value={settings.type}
              onValueChange={handleTypeChange}
              options={proxyTypeOptions}
            />
          </div>

          {/* Host and Port */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">
                {t("settings.proxy_host")}
              </label>
              <input
                type="text"
                value={settings.host}
                onChange={(e) =>
                  setSettings({ ...settings, host: e.target.value })
                }
                placeholder="127.0.0.1"
                className={cn(
                  "mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm",
                  "placeholder:text-muted-foreground/50",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                )}
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {t("settings.proxy_port")}
              </label>
              <input
                type="number"
                value={settings.port || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    port: parseInt(e.target.value, 10) || 0,
                  })
                }
                placeholder="7890"
                className={cn(
                  "mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm",
                  "placeholder:text-muted-foreground/50",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                )}
              />
            </div>
          </div>

          {/* Authentication */}
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("settings.proxy_auth")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">
                  {t("settings.proxy_username")}
                </label>
                <input
                  type="text"
                  value={settings.username}
                  onChange={(e) =>
                    setSettings({ ...settings, username: e.target.value })
                  }
                  className={cn(
                    "mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm",
                    "placeholder:text-muted-foreground/50",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                  )}
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t("settings.proxy_password")}
                </label>
                <input
                  type="password"
                  value={settings.password}
                  onChange={(e) =>
                    setSettings({ ...settings, password: e.target.value })
                  }
                  className={cn(
                    "mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm",
                    "placeholder:text-muted-foreground/50",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                  )}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || !canTest}
              className={cn(
                "h-9 rounded-md px-4 text-sm font-medium transition-colors shrink-0",
                "border border-border bg-background hover:bg-accent",
                "disabled:cursor-not-allowed disabled:opacity-50",
                testStatus === "success" && "border-green-600 text-green-600",
                testStatus === "error" && "border-destructive text-destructive",
              )}
            >
              {isTesting
                ? t("settings.proxy_testing")
                : t("settings.proxy_test")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={cn(
                "h-9 rounded-md px-4 text-sm font-medium transition-colors shrink-0",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:cursor-not-allowed disabled:opacity-50",
                saveStatus === "success" && "bg-green-600 hover:bg-green-600",
                saveStatus === "error" && "bg-destructive hover:bg-destructive",
              )}
            >
              {isSaving
                ? t("settings.saving")
                : saveStatus === "success"
                  ? t("settings.saved")
                  : t("settings.save")}
            </button>
            {testMessage && (
              <span
                className={cn(
                  "text-sm",
                  testStatus === "success" && "text-green-600",
                  testStatus === "error" && "text-destructive",
                )}
              >
                {testMessage}
              </span>
            )}
          </div>
        </div>
      </fieldset>
    </div>
  );
}

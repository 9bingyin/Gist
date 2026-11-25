import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  useGeneralSettings,
  useUpdateGeneralSettings,
} from "@/hooks/useSettings";

type Language = "zh" | "en";

export function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const { data: generalSettings, isLoading: isGeneralSettingsLoading } =
    useGeneralSettings();
  const updateGeneralMutation = useUpdateGeneralSettings();

  // Keep unsaved draft separate so toggling switches never overwrites fallbackUA edits
  const [fallbackUADraft, setFallbackUADraft] = useState<string | null>(null);
  const [autoReadabilityOverride, setAutoReadabilityOverride] = useState<
    boolean | null
  >(null);
  const [markReadOnScrollOverride, setMarkReadOnScrollOverride] = useState<
    boolean | null
  >(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  const fallbackUA =
    fallbackUADraft ?? generalSettings?.fallbackUserAgent ?? "";
  const autoReadability =
    autoReadabilityOverride ?? generalSettings?.autoReadability ?? false;
  const markReadOnScroll =
    markReadOnScrollOverride ?? generalSettings?.markReadOnScroll ?? false;
  const settingsDisabled = isGeneralSettingsLoading || !generalSettings;

  const handleSaveFallbackUA = async () => {
    if (!generalSettings) return;

    setSaveStatus("idle");
    try {
      await updateGeneralMutation.mutateAsync({
        fallbackUserAgent: fallbackUA,
        autoReadability,
        markReadOnScroll,
      });
      setFallbackUADraft(null);
      setSaveStatus("success");
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  };

  const handleAutoReadabilityChange = useCallback(
    async (checked: boolean) => {
      if (!generalSettings) return;

      setAutoReadabilityOverride(checked);
      try {
        await updateGeneralMutation.mutateAsync({
          fallbackUserAgent: generalSettings.fallbackUserAgent,
          autoReadability: checked,
          markReadOnScroll,
        });
      } catch {
        // Revert via server value on error
      } finally {
        setAutoReadabilityOverride(null);
      }
    },
    [generalSettings, markReadOnScroll, updateGeneralMutation],
  );

  const handleMarkReadOnScrollChange = useCallback(
    async (checked: boolean) => {
      if (!generalSettings) return;

      setMarkReadOnScrollOverride(checked);
      try {
        await updateGeneralMutation.mutateAsync({
          fallbackUserAgent: generalSettings.fallbackUserAgent,
          autoReadability,
          markReadOnScroll: checked,
        });
      } catch {
        // Revert via server value on error
      } finally {
        setMarkReadOnScrollOverride(null);
      }
    },
    [autoReadability, generalSettings, updateGeneralMutation],
  );

  const languageOptions = useMemo(
    () => [
      { value: "zh" as Language, label: t("language.zh") },
      { value: "en" as Language, label: t("language.en") },
    ],
    [t],
  );

  const changeLanguage = (lng: Language) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("gist-lang", lng);
  };

  const isSaving = updateGeneralMutation.isPending;

  return (
    <div className="space-y-6">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t("language.label")}</div>
            <div className="text-xs text-muted-foreground">
              {t("language.description")}
            </div>
          </div>
          <SegmentedControl
            className="shrink-0"
            value={(i18n.language as Language) || "zh"}
            onValueChange={changeLanguage}
            options={languageOptions}
          />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {t("settings.auto_readability")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("settings.auto_readability_description")}
            </div>
          </div>
          <Switch
            checked={autoReadability}
            onCheckedChange={handleAutoReadabilityChange}
            disabled={settingsDisabled}
          />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {t("settings.mark_read_on_scroll")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("settings.mark_read_on_scroll_description")}
            </div>
          </div>
          <Switch
            checked={markReadOnScroll}
            onCheckedChange={handleMarkReadOnScrollChange}
            disabled={settingsDisabled}
          />
        </div>
      </section>

      <section>
        <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("settings.advanced")}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {t("settings.fallback_ua")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("settings.fallback_ua_description")}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <input
              type="text"
              value={fallbackUA}
              onChange={(e) => setFallbackUADraft(e.target.value)}
              disabled={settingsDisabled}
              placeholder={t("settings.fallback_ua_placeholder")}
              className={cn(
                "h-9 w-64 max-w-full rounded-md border border-border bg-background px-3 text-sm",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              )}
            />
            <button
              type="button"
              onClick={handleSaveFallbackUA}
              disabled={isSaving || settingsDisabled}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium transition-colors shrink-0",
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
          </div>
        </div>
      </section>
    </div>
  );
}

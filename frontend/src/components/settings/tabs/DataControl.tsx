import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Trash2, Upload } from "lucide-react";
import {
  startImportOPML,
  watchImportStatus,
  cancelImportOPML,
  exportOPML,
  clearAICache,
  clearAnubisCookies,
  clearIconCache,
  clearReadabilityCache,
  clearEntryCache,
} from "@/api";
import { useTranslationStore } from "@/stores/translation-store";
import { cn } from "@/lib/utils";
import type { ImportResult, ImportTask } from "@/types/api";

interface CacheActionConfig {
  id: string;
  title: string;
  description: string;
  action: () => Promise<string>;
}

export function DataControl() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [task, setTask] = useState<ImportTask | null>(null);

  const watchCancelRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  const isImporting = task?.status === "running";

  const startWatching = useCallback(() => {
    watchCancelRef.current?.();
    watchCancelRef.current = watchImportStatus((nextTask) => {
      if (!mountedRef.current) return;
      setTask(nextTask);

      if (nextTask.status === "done" && nextTask.result) {
        setImportResult(nextTask.result);
        queryClient.invalidateQueries({ queryKey: ["folders"] });
        queryClient.invalidateQueries({ queryKey: ["feeds"] });
        queryClient.invalidateQueries({ queryKey: ["unreadCounts"] });
      } else if (nextTask.status === "error") {
        setImportError(nextTask.error || "Import failed");
      }
    });
  }, [queryClient]);

  useEffect(() => {
    mountedRef.current = true;
    startWatching();

    return () => {
      mountedRef.current = false;
      watchCancelRef.current?.();
      watchCancelRef.current = null;
    };
  }, [startWatching]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    setImportError(null);
    setTask(null);

    try {
      await startImportOPML(file);
      if (mountedRef.current) {
        startWatching();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Import failed";
      setImportError(message);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCancel = async () => {
    try {
      await cancelImportOPML();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cancel failed";
      setImportError(message);
    }
  };

  const handleExport = async () => {
    setExportError(null);
    try {
      await exportOPML();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      setExportError(message);
    }
  };

  const cacheItems: CacheActionConfig[] = useMemo(
    () => [
      {
        id: "entry",
        title: t("data_control.clear_entry_cache"),
        description: t("data_control.clear_entry_cache_description"),
        action: async () => {
          const res = await clearEntryCache();
          queryClient.invalidateQueries({ queryKey: ["entries"] });
          queryClient.invalidateQueries({ queryKey: ["entry"] });
          queryClient.invalidateQueries({ queryKey: ["unreadCounts"] });
          return t("data_control.cleared_count", { count: res.deleted });
        },
      },
      {
        id: "readability",
        title: t("data_control.clear_readability_cache"),
        description: t("data_control.clear_readability_cache_description"),
        action: async () => {
          const res = await clearReadabilityCache();
          queryClient.invalidateQueries({ queryKey: ["entry"] });
          return t("data_control.cleared_count", { count: res.deleted });
        },
      },
      {
        id: "icon",
        title: t("data_control.clear_icon_cache"),
        description: t("data_control.clear_icon_cache_description"),
        action: async () => {
          const res = await clearIconCache();
          return t("data_control.cleared_count", { count: res.deleted });
        },
      },
      {
        id: "ai",
        title: t("data_control.clear_ai_cache"),
        description: t("data_control.clear_ai_cache_description"),
        action: async () => {
          const res = await clearAICache();
          useTranslationStore.getState().clearAll();
          return t("data_control.cleared_ai_items", {
            summaries: res.summaries,
            translations: res.translations + res.listTranslations,
          });
        },
      },
      {
        id: "anubis",
        title: t("data_control.clear_anubis_cookies"),
        description: t("data_control.clear_anubis_cookies_description"),
        action: async () => {
          const res = await clearAnubisCookies();
          return t("data_control.cleared_count", { count: res.deleted });
        },
      },
    ],
    [t, queryClient],
  );

  return (
    <div className="space-y-6">
      {/* Import Section */}
      <section>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
          {t("data_control.import_data")}
        </h3>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {t("data_control.import_feeds")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("data_control.import_description")}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={handleImportClick}
              disabled={isImporting}
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium",
                "transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {isImporting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>{t("data_control.importing")}</span>
                </>
              ) : (
                <>
                  <Upload className="size-4" strokeWidth={1.5} />
                  <span>{t("data_control.select_file")}</span>
                </>
              )}
            </button>
          </div>

          {task && task.status === "running" && task.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(task.current / task.total) * 100}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t("data_control.stop")}
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                {task.feed
                  ? `${task.feed} (${task.current}/${task.total})`
                  : `${task.current}/${task.total}`}
              </div>
            </div>
          )}

          {task && task.status === "cancelled" && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm dark:border-yellow-900 dark:bg-yellow-950">
              <div className="font-medium text-yellow-800 dark:text-yellow-200">
                {t("data_control.import_stopped")}
              </div>
              <div className="mt-1 text-yellow-700 dark:text-yellow-300">
                {t("data_control.imported_progress", {
                  current: task.current,
                  total: task.total,
                })}
              </div>
            </div>
          )}

          {importResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
              <div className="font-medium text-green-800 dark:text-green-200">
                {t("data_control.import_success")}
              </div>
              <ul className="mt-1 space-y-0.5 text-green-700 dark:text-green-300">
                <li>
                  {t("data_control.folders_created", {
                    count: importResult.foldersCreated,
                  })}
                </li>
                <li>
                  {t("data_control.feeds_created", {
                    count: importResult.feedsCreated,
                  })}
                </li>
                {(importResult.foldersSkipped > 0 ||
                  importResult.feedsSkipped > 0) && (
                  <li className="text-green-600 dark:text-green-400">
                    {t("data_control.skipped_items", {
                      foldersSkipped: importResult.foldersSkipped,
                      feedsSkipped: importResult.feedsSkipped,
                    })}
                  </li>
                )}
              </ul>
            </div>
          )}

          {importError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950">
              <div className="font-medium text-red-800 dark:text-red-200">
                {t("data_control.import_failed")}
              </div>
              <div className="mt-1 text-red-700 dark:text-red-300">
                {importError}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Export Section */}
      <section>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
          {t("data_control.export_data")}
        </h3>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {t("data_control.export_feeds")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("data_control.export_description")}
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium",
                "transition-colors hover:bg-accent",
              )}
            >
              <Download className="size-4" strokeWidth={1.5} />
              <span>{t("data_control.export")}</span>
            </button>
          </div>

          {exportError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs dark:border-red-900 dark:bg-red-950">
              <span className="text-red-700 dark:text-red-300">
                {exportError}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Clear Cache Section */}
      <section>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
          {t("data_control.clear_cache")}
        </h3>

        <div className="space-y-4">
          {cacheItems.map((item) => (
            <ClearCacheItem key={item.id} config={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ClearCacheItem({ config }: { config: CacheActionConfig }) {
  const { t } = useTranslation();
  const [isClearing, setIsClearing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClear = async () => {
    setIsClearing(true);
    setResult(null);
    setError(null);
    try {
      const message = await config.action();
      setResult(message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("data_control.clear_failed"),
      );
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">{config.title}</div>
          <div className="text-xs text-muted-foreground">
            {config.description}
          </div>
        </div>

        <button
          type="button"
          onClick={handleClear}
          disabled={isClearing}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium",
            "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900",
          )}
        >
          {isClearing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>{t("data_control.clearing")}</span>
            </>
          ) : (
            <>
              <Trash2 className="size-4" strokeWidth={1.5} />
              <span>{t("data_control.clear")}</span>
            </>
          )}
        </button>
      </div>

      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs dark:border-green-900 dark:bg-green-950">
          <span className="text-green-700 dark:text-green-300">{result}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs dark:border-red-900 dark:bg-red-950">
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}
    </div>
  );
}

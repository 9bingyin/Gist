import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import {
  useCreateDomainRateLimit,
  useDeleteDomainRateLimit,
  useDomainRateLimits,
  useUpdateDomainRateLimit,
} from "@/hooks/useSettings";
import type { DomainRateLimit } from "@/types/settings";
import { cn } from "@/lib/utils";

function isValidHostFormat(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed) return false;
  // Allow domains, IDN, IPv4/IPv6, and single-label internal hostnames (e.g. rsshub)
  return !/[\s/?#\\]/.test(trimmed);
}

export function AdvancedSettings() {
  const { t } = useTranslation();
  const { data, isLoading, error: loadError } = useDomainRateLimits();
  const createMutation = useCreateDomainRateLimit();
  const updateMutation = useUpdateDomainRateLimit();
  const deleteMutation = useDeleteDomainRateLimit();

  const items = data?.items ?? [];

  const [newHost, setNewHost] = useState("");
  const [newInterval, setNewInterval] = useState("");
  const [editingHost, setEditingHost] = useState<string | null>(null);
  const [editInterval, setEditInterval] = useState<number>(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!isValidHostFormat(newHost)) return;

    const interval = Math.max(0, parseInt(newInterval, 10) || 0);
    setActionError(null);
    try {
      await createMutation.mutateAsync({
        host: newHost.trim(),
        intervalSeconds: interval,
      });
      setNewHost("");
      setNewInterval("");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t("ai_settings.failed_to_save"),
      );
    }
  };

  const startEdit = (item: DomainRateLimit) => {
    setEditingHost(item.host);
    setEditInterval(item.intervalSeconds);
    setActionError(null);
  };

  const cancelEdit = () => {
    setEditingHost(null);
    setEditInterval(0);
  };

  const handleUpdate = async () => {
    if (!editingHost) return;
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        host: editingHost,
        intervalSeconds: editInterval,
      });
      setEditingHost(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t("ai_settings.failed_to_save"),
      );
    }
  };

  const handleDelete = async (host: string) => {
    if (!confirm(t("settings.confirm_delete") || "Are you sure?")) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(host);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t("feeds.delete_failed"),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(loadError || actionError) && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError ||
            (loadError instanceof Error
              ? loadError.message
              : t("ai_settings.failed_to_load"))}
        </div>
      )}

      {/* Domain Rate Limits Section */}
      <section>
        <div className="mb-4">
          <div className="text-sm font-medium">
            {t("settings.advanced_domain_limits")}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("settings.advanced_domain_limits_description")}
          </div>
        </div>

        <div className="space-y-2">
          {/* Add Row */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
              placeholder="example.com"
              className={cn(
                "h-9 min-w-[120px] flex-1 rounded-md border border-border bg-background px-3 text-sm",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              )}
            />
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                min="0"
                value={newInterval}
                onChange={(e) => setNewInterval(e.target.value)}
                placeholder={t("settings.advanced_seconds")}
                className={cn(
                  "h-9 w-20 rounded-md border border-border bg-background px-3 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                )}
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={
                  createMutation.isPending || !isValidHostFormat(newHost)
                }
                aria-label={t("settings.advanced_add_domain")}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("settings.advanced_no_domains")}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const isEditing = editingHost === item.host;
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2"
                  >
                    <div
                      className="min-w-[120px] flex-1 px-2 text-sm font-mono truncate"
                      title={item.host}
                    >
                      {item.host}
                    </div>

                    {isEditing ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={editInterval}
                          autoFocus
                          onChange={(e) =>
                            setEditInterval(
                              Math.max(0, parseInt(e.target.value, 10) || 0),
                            )
                          }
                          className={cn(
                            "h-9 w-20 rounded-md border border-border bg-background px-3 text-sm",
                            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                          )}
                        />
                        <button
                          type="button"
                          onClick={handleUpdate}
                          disabled={updateMutation.isPending}
                          aria-label={t("actions.save")}
                          className="flex size-9 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                        >
                          <Check className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          aria-label={t("actions.cancel")}
                          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <div className="w-20 text-center text-xs text-muted-foreground">
                          {item.intervalSeconds}s
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          aria-label={t("settings.advanced_edit")}
                          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.host)}
                          disabled={deleteMutation.isPending}
                          aria-label={t("settings.advanced_delete")}
                          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

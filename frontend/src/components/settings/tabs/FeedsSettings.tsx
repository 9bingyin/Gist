import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, RefreshCw, Rss, Trash2 } from "lucide-react";
import { useFeeds } from "@/hooks/useFeeds";
import {
  REFRESH_STATUS_QUERY_KEY,
  useRefreshStatusQuery,
} from "@/hooks/useRefreshStatus";
import { deleteFeeds, refreshAllFeeds, ApiError } from "@/api";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, compareStrings } from "@/lib/table-utils";
import { EditFeedDialog } from "./EditFeedDialog";
import {
  SortableTableHeader,
  TableCheckbox,
  type SortDirection,
} from "./SortableTableHeader";
import type { Feed } from "@/types/api";

type SortField = "title" | "createdAt" | "updatedAt";

export function FeedsSettings() {
  const { t } = useTranslation();
  const { data: feeds = [], isLoading, refetch } = useFeeds();
  const { data: refreshStatus } = useRefreshStatusQuery();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isTriggeringRefresh, setIsTriggeringRefresh] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);

  const isRefreshing =
    isTriggeringRefresh || Boolean(refreshStatus?.isRefreshing);

  const sortedFeeds = useMemo(() => {
    return [...feeds].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = compareStrings(a.title, b.title);
      } else if (sortField === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "updatedAt") {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [feeds, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === feeds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(feeds.map((f) => f.id)));
    }
  };

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleRefreshAll = async () => {
    setError(null);
    setIsTriggeringRefresh(true);
    try {
      await refreshAllFeeds();
      // Immediately re-fetch refreshStatus so fast 1500ms polling and UI feedback start right away
      queryClient.setQueryData(REFRESH_STATUS_QUERY_KEY, (old: unknown) => ({
        ...(typeof old === "object" && old !== null ? old : {}),
        isRefreshing: true,
      }));
      await queryClient.invalidateQueries({
        queryKey: REFRESH_STATUS_QUERY_KEY,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("feeds.refresh_in_progress"));
        await queryClient.invalidateQueries({
          queryKey: REFRESH_STATUS_QUERY_KEY,
        });
      } else {
        setError(t("feeds.refresh_failed"));
      }
    } finally {
      setIsTriggeringRefresh(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    setError(null);
    setIsDeleting(true);
    try {
      await deleteFeeds(Array.from(selectedIds));
      setSelectedIds(new Set());
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["unreadCounts"] });
    } catch {
      setError(t("feeds.delete_failed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const isAllSelected = feeds.length > 0 && selectedIds.size === feeds.length;
  const isPartialSelected =
    selectedIds.size > 0 && selectedIds.size < feeds.length;

  const columns = useMemo(
    () => [
      { field: "title" as const, label: t("feeds.name") },
      {
        field: "createdAt" as const,
        label: t("feeds.subscribe_date"),
        className: "hidden sm:table-cell w-28",
      },
      {
        field: "updatedAt" as const,
        label: t("feeds.last_update"),
        className: "hidden sm:table-cell w-36",
      },
      { label: t("feeds.actions"), className: "w-16" },
    ],
    [t],
  );

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t("feeds.subscribed_feeds", { count: feeds.length })}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin")}
            />
            <span>
              {isRefreshing ? t("feeds.refreshing") : t("feeds.refresh_all")}
            </span>
          </button>
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0 || isDeleting}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Trash2 className="size-4" />
            <span>
              {isDeleting
                ? t("feeds.deleting")
                : t("feeds.delete_count", { count: selectedIds.size })}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {feeds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("feeds.no_feeds")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <SortableTableHeader
              columns={columns}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              isAllSelected={isAllSelected}
              isPartialSelected={isPartialSelected}
              onSelectAll={handleSelectAll}
              selectAllLabel={t("feeds.name")}
            />
            <tbody className="divide-y divide-border">
              {sortedFeeds.map((feed: Feed) => {
                const isSelected = selectedIds.has(feed.id);
                return (
                  <tr
                    key={feed.id}
                    className={cn(
                      "transition-colors",
                      isSelected ? "bg-primary/5" : "hover:bg-muted/30",
                    )}
                  >
                    <td className="px-3 py-2">
                      <TableCheckbox
                        checked={isSelected}
                        onToggle={() => handleSelect(feed.id)}
                        ariaLabel={feed.title}
                      />
                    </td>
                    <td className="max-w-[200px] px-3 py-2">
                      <div className="flex items-center gap-2">
                        {feed.iconPath ? (
                          <img
                            src={`/icons/${feed.iconPath}`}
                            alt=""
                            className="size-4 shrink-0 rounded object-contain"
                          />
                        ) : (
                          <div className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                            <Rss className="size-3" strokeWidth={1.5} />
                          </div>
                        )}
                        <span
                          className="truncate font-medium"
                          title={feed.title}
                        >
                          {feed.title}
                        </span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-muted-foreground">
                      {formatDate(feed.createdAt)}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-muted-foreground">
                      {formatDateTime(feed.updatedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setEditingFeed(feed)}
                        className={cn(
                          "flex size-7 items-center justify-center rounded transition-colors",
                          "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        title={t("feeds.edit")}
                        aria-label={`${t("feeds.edit")} ${feed.title}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EditFeedDialog
        feed={editingFeed}
        open={editingFeed !== null}
        onOpenChange={(open) => !open && setEditingFeed(null)}
      />
    </div>
  );
}

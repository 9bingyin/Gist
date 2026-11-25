import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Folder as FolderIcon, Trash2 } from "lucide-react";
import { useFolders } from "@/hooks/useFolders";
import { deleteFolders } from "@/api";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, compareStrings } from "@/lib/table-utils";
import {
  SortableTableHeader,
  TableCheckbox,
  type SortDirection,
} from "./SortableTableHeader";
import type { Folder } from "@/types/api";

type SortField = "name" | "createdAt" | "updatedAt";

export function FoldersSettings() {
  const { t } = useTranslation();
  const { data: folders = [], isLoading, refetch } = useFolders();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = compareStrings(a.name, b.name);
      } else if (sortField === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "updatedAt") {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [folders, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === folders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(folders.map((f) => f.id)));
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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    setError(null);
    setIsDeleting(true);
    try {
      await deleteFolders(Array.from(selectedIds));
      setSelectedIds(new Set());
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["unreadCounts"] });
    } catch {
      setError(t("folders.delete_failed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const isAllSelected =
    folders.length > 0 && selectedIds.size === folders.length;
  const isPartialSelected =
    selectedIds.size > 0 && selectedIds.size < folders.length;

  const columns = useMemo(
    () => [
      { field: "name" as const, label: t("folders.name") },
      {
        field: "createdAt" as const,
        label: t("folders.create_date"),
        className: "hidden sm:table-cell w-28",
      },
      {
        field: "updatedAt" as const,
        label: t("folders.last_update"),
        className: "hidden sm:table-cell w-36",
      },
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
          {t("folders.title", { count: folders.length })}
        </h3>
        <div className="flex items-center gap-2">
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
                ? t("folders.deleting")
                : t("folders.delete_count", { count: selectedIds.size })}
            </span>
          </button>
        </div>
      </div>

      <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
        {t("folders.delete_warning")}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {folders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("folders.no_folders")}
          </p>
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
              selectAllLabel={t("folders.name")}
            />
            <tbody className="divide-y divide-border">
              {sortedFolders.map((folder: Folder) => {
                const isSelected = selectedIds.has(folder.id);
                return (
                  <tr
                    key={folder.id}
                    className={cn(
                      "transition-colors",
                      isSelected ? "bg-primary/5" : "hover:bg-muted/30",
                    )}
                  >
                    <td className="px-3 py-2">
                      <TableCheckbox
                        checked={isSelected}
                        onToggle={() => handleSelect(folder.id)}
                        ariaLabel={folder.name}
                      />
                    </td>
                    <td className="max-w-[200px] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                          <FolderIcon className="size-3" strokeWidth={1.5} />
                        </div>
                        <span
                          className="truncate font-medium"
                          title={folder.name}
                        >
                          {folder.name}
                        </span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-muted-foreground">
                      {formatDate(folder.createdAt)}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-muted-foreground">
                      {formatDateTime(folder.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

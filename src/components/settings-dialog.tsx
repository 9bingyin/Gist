"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { CHROME_USER_AGENT, DEFAULT_REFRESH_INTERVAL } from "@/lib/constants";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  SettingsIcon,
  RssIcon,
  Trash2Icon,
  ExternalLinkIcon,
  RefreshCwIcon,
  GlobeIcon,
  DownloadIcon,
  UploadIcon,
  CheckCircleIcon,
  DatabaseIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckSquareIcon,
  SquareIcon,
  FolderIcon,
  PlusIcon,
  PencilIcon,
  BugIcon,
  LoaderIcon,
  StopCircleIcon,
  AlertCircleIcon,
  SparklesIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoreHorizontalIcon } from "lucide-react";
import type { Feed, Folder, ContentType } from "@/lib/types";
import type { Task } from "@/lib/task-queue";

type SettingsTab =
  | "feeds"
  | "folders"
  | "ai"
  | "general"
  | "data"
  | "debug"
  | "about";

interface SettingsDialogProps {
  feeds: Feed[];
  folders: Folder[];
  onRefreshFeed: (feedId: string) => Promise<void>;
  onDeleteFeed: (feedId: string) => Promise<void>;
  onRefreshAllFeeds: () => Promise<void>;
  onAddFolder: (name: string, type: ContentType) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onMoveFeedToFolder: (
    feedId: string,
    folderId: string | null,
  ) => Promise<void>;
  onChangeFeedType: (feedId: string, type: ContentType) => Promise<void>;
  onChangeFolderType: (folderId: string, type: ContentType) => Promise<void>;
  onDataChange?: () => Promise<void>;
  children?: React.ReactNode;
}

// menu labels are defined per-locale inside the component so `t` is available

export function SettingsDialog({
  feeds,
  folders,
  onRefreshFeed,
  onDeleteFeed,
  onRefreshAllFeeds,
  onAddFolder,
  onDeleteFolder,
  onRenameFolder,
  onMoveFeedToFolder,
  onChangeFeedType,
  onChangeFolderType,
  onDataChange,
  children,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [refreshingFeedId, setRefreshingFeedId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importTask, setImportTask] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const eventSourceRef = useRef<EventSource | null>(null);

  const subscribeToTask = useCallback(
    (taskId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(`/api/tasks/${taskId}/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const task: Task = JSON.parse(event.data);
          setImportTask(task);

          if (
            task.status === "completed" ||
            task.status === "failed" ||
            task.status === "cancelled"
          ) {
            eventSource.close();
            eventSourceRef.current = null;
            setIsImporting(false);

            if (task.status === "completed") {
              onDataChange?.();
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsImporting(false);
      };
    },
    [onDataChange],
  );

  useEffect(() => {
    const checkExistingTask = async () => {
      try {
        const res = await fetch("/api/tasks");
        if (res.ok) {
          const tasks: Task[] = await res.json();
          const runningTask = tasks.find(
            (t) =>
              t.type === "opml-import" &&
              (t.status === "running" || t.status === "pending"),
          );
          if (runningTask) {
            setImportTask(runningTask);
            setIsImporting(true);
            subscribeToTask(runningTask.id);
          }
        }
      } catch (err) {
        console.error("Failed to check existing tasks:", err);
      }
    };
    checkExistingTask();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [subscribeToTask]);

  const menuItems: { id: SettingsTab; label: string; icon: React.ReactNode }[] =
    [
      {
        id: "general",
        label: t("menu.general"),
        icon: <SettingsIcon className="size-4" />,
      },
      {
        id: "feeds",
        label: t("menu.subscriptions"),
        icon: <RssIcon className="size-4" />,
      },
      {
        id: "folders",
        label: t("menu.folders"),
        icon: <FolderIcon className="size-4" />,
      },
      {
        id: "ai",
        label: t("menu.ai"),
        icon: <SparklesIcon className="size-4" />,
      },
      {
        id: "data",
        label: t("menu.data"),
        icon: <DatabaseIcon className="size-4" />,
      },
      {
        id: "debug",
        label: t("menu.debug"),
        icon: <BugIcon className="size-4" />,
      },
      {
        id: "about",
        label: t("menu.about"),
        icon: <GlobeIcon className="size-4" />,
      },
    ];

  const handleRefreshFeed = async (feedId: string) => {
    setRefreshingFeedId(feedId);
    try {
      await onRefreshFeed(feedId);
    } finally {
      setRefreshingFeedId(null);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      await onRefreshAllFeeds();
    } finally {
      setRefreshingAll(false);
    }
  };

  const totalArticles = feeds.reduce(
    (sum, feed) => sum + feed._count.articles,
    0,
  );

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="icon">
            <SettingsIcon className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className={
          isMobile
            ? "w-full h-full max-w-full max-h-full p-0 gap-0 overflow-hidden border-none rounded-none"
            : "sm:max-w-4xl h-[650px] max-h-[90vh] p-0 gap-0 overflow-hidden border-none shadow-2xl"
        }
      >
        <DialogTitle className="sr-only">{t("settings.title")}</DialogTitle>
        <div className="flex flex-col md:flex-row h-full overflow-hidden bg-background">
          {/* Mobile header with tabs */}
          {isMobile ? (
            <div className="border-b bg-muted/20 shrink-0">
              <div className="px-4 py-3">
                <h2 className="text-lg font-semibold tracking-tight">
                  {t("settings.title")}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <nav className="flex px-2 pb-2 gap-1 min-w-max">
                  {menuItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                        activeTab === item.id
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <div
                        className={
                          activeTab === item.id
                            ? "text-primary-foreground"
                            : "text-muted-foreground/70"
                        }
                      >
                        {item.icon}
                      </div>
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          ) : (
            /* Desktop left menu */
            <div className="w-[200px] border-r bg-muted/20 p-5 flex flex-col shrink-0">
              <div className="mb-6 px-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  {t("settings.title")}
                </h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-0.5">
                  {t("settings.subtitle")}
                </p>
              </div>
              <nav className="space-y-1 flex-1">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ${
                      activeTab === item.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <div
                      className={
                        activeTab === item.id
                          ? "text-primary-foreground"
                          : "text-muted-foreground/70"
                      }
                    >
                      {item.icon}
                    </div>
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="mt-auto pt-3 px-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono opacity-50">
                  <span>{t("app.version")}</span>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth bg-background">
            <div className="max-w-3xl mx-auto">
              {activeTab === "general" && <GeneralSettings />}
              {activeTab === "feeds" && (
                <FeedsSettings
                  feeds={feeds}
                  folders={folders}
                  totalArticles={totalArticles}
                  refreshingFeedId={refreshingFeedId}
                  refreshingAll={refreshingAll}
                  onRefreshFeed={handleRefreshFeed}
                  onDeleteFeed={onDeleteFeed}
                  onRefreshAll={handleRefreshAll}
                  onMoveFeedToFolder={onMoveFeedToFolder}
                  onChangeFeedType={onChangeFeedType}
                />
              )}
              {activeTab === "folders" && (
                <FoldersSettings
                  folders={folders}
                  feeds={feeds}
                  onAddFolder={onAddFolder}
                  onDeleteFolder={onDeleteFolder}
                  onRenameFolder={onRenameFolder}
                  onChangeFolderType={onChangeFolderType}
                />
              )}
              {activeTab === "ai" && <AISettings />}
              {activeTab === "data" && (
                <DataSettings
                  onDataChange={onDataChange}
                  isImporting={isImporting}
                  setIsImporting={setIsImporting}
                  importTask={importTask}
                  setImportTask={setImportTask}
                  subscribeToTask={subscribeToTask}
                />
              )}
              {activeTab === "debug" && <DebugSettings />}
              {activeTab === "about" && <AboutSettings />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FeedsSettingsProps {
  feeds: Feed[];
  folders: Folder[];
  totalArticles: number;
  refreshingFeedId: string | null;
  refreshingAll: boolean;
  onRefreshFeed: (feedId: string) => Promise<void>;
  onDeleteFeed: (feedId: string) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onMoveFeedToFolder: (
    feedId: string,
    folderId: string | null,
  ) => Promise<void>;
  onChangeFeedType: (feedId: string, type: ContentType) => Promise<void>;
}

function FeedsSettings({
  feeds,
  folders,
  totalArticles,
  refreshingFeedId,
  refreshingAll,
  onRefreshFeed,
  onDeleteFeed,
  onRefreshAll,
  onMoveFeedToFolder,
  onChangeFeedType,
}: FeedsSettingsProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const toggleSelectAll = () => {
    if (selectedIds.size === feeds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(feeds.map((f) => f.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBulkRefresh = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkRefreshing(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => onRefreshFeed(id)));
    } finally {
      setIsBulkRefreshing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(t("feeds.delete_selected_confirm", { count: selectedIds.size }))
    )
      return;

    setIsBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => onDeleteFeed(id)));
      setSelectedIds(new Set());
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h3 className="text-xl font-bold tracking-tight">{t("feeds.title")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("feeds.subscribed_count", { count: feeds.length })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-muted/40 bg-card p-4 transition-all hover:border-muted-foreground/20 hover:shadow-sm">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            {t("feeds.total_feeds")}
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {feeds.length}
          </div>
        </div>
        <div className="rounded-xl border border-muted/40 bg-card p-4 transition-all hover:border-muted-foreground/20 hover:shadow-sm">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            {t("feeds.unread")}
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {totalArticles}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t("feeds.list")}
            </h4>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
                <Separator orientation="vertical" className="h-4 mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-primary hover:bg-primary/10 rounded-md"
                  onClick={handleBulkRefresh}
                  disabled={isBulkRefreshing || isBulkDeleting}
                >
                  <RefreshCwIcon
                    className={`mr-1.5 size-3 ${isBulkRefreshing ? "animate-spin" : ""}`}
                  />
                  {t("actions.refresh")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 rounded-md"
                  onClick={handleBulkDelete}
                  disabled={isBulkRefreshing || isBulkDeleting}
                >
                  <Trash2Icon className="mr-1.5 size-3" />
                  {t("actions.delete")}
                </Button>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-md px-4 h-8 text-xs font-medium border-muted-foreground/20 hover:bg-muted"
            onClick={onRefreshAll}
            disabled={
              refreshingAll ||
              feeds.length === 0 ||
              isBulkRefreshing ||
              isBulkDeleting
            }
          >
            <RefreshCwIcon
              className={`mr-2 size-3 ${refreshingAll ? "animate-spin" : ""}`}
            />
            {t("actions.refresh_all")}
          </Button>
        </div>

        {/* Feeds table */}
        {feeds.length === 0 ? (
          <div className="flex h-[240px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted bg-muted/10">
            <div className="rounded-full bg-muted p-4 mb-4">
              <RssIcon className="size-6 text-muted-foreground/60" />
            </div>
            <p className="font-medium text-muted-foreground">
              {t("feeds.empty.title")}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {t("feeds.empty.subtitle")}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-muted/40 overflow-hidden bg-card shadow-sm">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="w-[48px] pl-4">
                    <Checkbox
                      checked={
                        selectedIds.size === feeds.length && feeds.length > 0
                      }
                      onCheckedChange={toggleSelectAll}
                      className="rounded-[4px]"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                    {t("table.source")}
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                    {t("table.folder")}
                  </TableHead>
                  <TableHead className="w-[100px] text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                    {t("content_type.select_type")}
                  </TableHead>
                  <TableHead className="w-[80px] text-center text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                    {t("table.unread")}
                  </TableHead>
                  <TableHead className="w-[48px] pr-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeds.map((feed) => (
                  <TableRow
                    key={feed.id}
                    className={`border-muted/40 hover:bg-muted/20 transition-colors ${selectedIds.has(feed.id) ? "bg-muted/40" : ""}`}
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        checked={selectedIds.has(feed.id)}
                        onCheckedChange={() => toggleSelect(feed.id)}
                        className="rounded-[4px]"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3 py-1">
                        {feed.imageUrl ? (
                          <img
                            src={`/api/icons/${feed.imageUrl}`}
                            alt=""
                            className="size-7 shrink-0 rounded-md object-cover shadow-sm border border-black/5 dark:border-white/5"
                          />
                        ) : (
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                            {feed.title.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-[13px] truncate max-w-[220px]">
                            {feed.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[220px] opacity-70">
                            {new URL(feed.url).hostname}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={feed.folderId || "none"}
                        onValueChange={(val) =>
                          onMoveFeedToFolder(
                            feed.id,
                            val === "none" ? null : val,
                          )
                        }
                      >
                        <SelectTrigger className="h-7 w-[120px] text-[11px] bg-transparent border-none hover:bg-muted/50 px-2 focus:ring-0">
                          <SelectValue placeholder={t("folders.none")} />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg shadow-xl border-muted/40">
                          <SelectItem value="none" className="text-[11px]">
                            {t("folders.none")}
                          </SelectItem>
                          {folders.map((folder) => (
                            <SelectItem
                              key={folder.id}
                              value={folder.id}
                              className="text-[11px]"
                            >
                              {folder.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={feed.type}
                        onValueChange={(val) =>
                          onChangeFeedType(feed.id, val as ContentType)
                        }
                      >
                        <SelectTrigger className="h-7 w-[90px] text-[11px] bg-transparent border-none hover:bg-muted/50 px-2 focus:ring-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg shadow-xl border-muted/40">
                          <SelectItem value="article" className="text-[11px]">
                            {t("content_type.article")}
                          </SelectItem>
                          <SelectItem value="picture" className="text-[11px]">
                            {t("content_type.picture")}
                          </SelectItem>
                          <SelectItem value="notification" className="text-[11px]">
                            {t("content_type.notification")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      {feed._count.articles > 0 ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                          {feed._count.articles}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground opacity-40">
                          0
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-md hover:bg-muted/50"
                          >
                            <MoreHorizontalIcon className="size-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-40 rounded-lg shadow-xl border-muted/40 p-1"
                        >
                          <DropdownMenuItem
                            onClick={() => onRefreshFeed(feed.id)}
                            disabled={refreshingFeedId === feed.id}
                            className="rounded-md text-xs"
                          >
                            <RefreshCwIcon
                              className={`mr-2 size-3.5 ${refreshingFeedId === feed.id ? "animate-spin" : ""}`}
                            />
                            {t("actions.refresh")}
                          </DropdownMenuItem>
                          {feed.siteUrl && (
                            <DropdownMenuItem
                              asChild
                              className="rounded-md text-xs"
                            >
                              <a
                                href={feed.siteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLinkIcon className="mr-2 size-3.5" />
                                {t("actions.visit_site")}
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDeleteFeed(feed.id)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-md text-xs"
                          >
                            <Trash2Icon className="mr-2 size-3.5" />
                            {t("actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

interface FoldersSettingsProps {
  folders: Folder[];
  feeds: Feed[];
  onAddFolder: (name: string, type: ContentType) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onChangeFolderType: (folderId: string, type: ContentType) => Promise<void>;
}

function FoldersSettings({
  folders,
  feeds,
  onAddFolder,
  onDeleteFolder,
  onRenameFolder,
  onChangeFolderType,
}: FoldersSettingsProps) {
  const { t } = useTranslation();
  const [newFolderName, setNewFolderName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Default to "article" type when creating from settings
      await onAddFolder(newFolderName.trim(), "article");
      setNewFolderName("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (folder: Folder) => {
    setEditingId(folder.id);
    setEditingName(folder.name);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onRenameFolder(editingId, editingName.trim());
      setEditingId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm(t("folders.delete_confirm"))) return;
    await onDeleteFolder(folderId);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === folders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(folders.map((f) => f.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        t("folders.delete_selected_confirm", { count: selectedIds.size }),
      )
    )
      return;

    setIsBulkDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => onDeleteFolder(id)),
      );
      setSelectedIds(new Set());
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h3 className="text-xl font-bold tracking-tight">
          {t("folders.title")}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("folders.description")}
        </p>
      </div>

      <div className="space-y-4">
        {/* Actions & Add Folder */}
        <div className="flex items-center justify-between gap-4">
          <form onSubmit={handleAddFolder} className="flex flex-1 gap-2">
            <div className="relative flex-1 max-w-[320px]">
              <Input
                placeholder={t("folders.new_folder_placeholder")}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="rounded-lg pl-4 pr-10 h-9 border-muted-foreground/20 bg-muted/20 focus-visible:ring-primary/20"
              />
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1 size-7 rounded-md text-primary hover:bg-primary/10"
                disabled={
                  isSubmitting || !newFolderName.trim() || isBulkDeleting
                }
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
          </form>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
              <span className="text-[11px] font-medium text-muted-foreground mr-2 uppercase tracking-wider">
                {t("folders.selected", { count: selectedIds.size })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 rounded-md text-xs text-destructive hover:bg-destructive/10"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting || isSubmitting}
              >
                <Trash2Icon className="mr-1.5 size-3" />
                {t("actions.delete_selected")}
              </Button>
            </div>
          )}
        </div>

        {/* Folders List */}
        <div className="rounded-xl border border-muted/40 overflow-hidden bg-card shadow-sm">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-[48px] pl-4">
                  <Checkbox
                    checked={
                      selectedIds.size === folders.length && folders.length > 0
                    }
                    onCheckedChange={toggleSelectAll}
                    className="rounded-[4px]"
                  />
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                  {t("table.folder_name")}
                </TableHead>
                <TableHead className="w-[100px] text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                  {t("content_type.select_type")}
                </TableHead>
                <TableHead className="w-[80px] text-center text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                  {t("table.feeds")}
                </TableHead>
                <TableHead className="w-[100px] pr-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                  {t("table.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center py-8">
                      <FolderIcon className="size-8 text-muted-foreground/20 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {t("folders.empty.title")}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                folders.map((folder) => (
                  <TableRow
                    key={folder.id}
                    className={`border-muted/40 hover:bg-muted/20 transition-colors ${selectedIds.has(folder.id) ? "bg-muted/40" : ""}`}
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        checked={selectedIds.has(folder.id)}
                        onCheckedChange={() => toggleSelect(folder.id)}
                        className="rounded-[4px]"
                      />
                    </TableCell>
                    <TableCell>
                      {editingId === folder.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="h-8 max-w-[200px] text-[13px] rounded-md border-primary/30"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <Button
                            size="sm"
                            className="h-8 rounded-md px-3"
                            onClick={handleSaveEdit}
                            disabled={isSubmitting}
                          >
                            {t("actions.save")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-md"
                            onClick={() => setEditingId(null)}
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 py-1">
                          <div className="size-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground/60">
                            <FolderIcon className="size-3.5" />
                          </div>
                          <span className="font-semibold text-[13px]">
                            {folder.name}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={folder.type}
                        onValueChange={(val) =>
                          onChangeFolderType(folder.id, val as ContentType)
                        }
                      >
                        <SelectTrigger className="h-7 w-[90px] text-[11px] bg-transparent border-none hover:bg-muted/50 px-2 focus:ring-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg shadow-xl border-muted/40">
                          <SelectItem value="article" className="text-[11px]">
                            {t("content_type.article")}
                          </SelectItem>
                          <SelectItem value="picture" className="text-[11px]">
                            {t("content_type.picture")}
                          </SelectItem>
                          <SelectItem value="notification" className="text-[11px]">
                            {t("content_type.notification")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                        {feeds.filter((f) => f.folderId === folder.id).length}
                      </span>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-md hover:bg-muted/50"
                          onClick={() => handleStartEdit(folder)}
                          disabled={isBulkDeleting}
                        >
                          <PencilIcon className="size-3.5 text-muted-foreground/70" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-md hover:bg-destructive/10 text-destructive/70 hover:text-destructive"
                          onClick={() => handleDeleteFolder(folder.id)}
                          disabled={isBulkDeleting}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const [lang, setLang] = useState<string>(() => {
    if (typeof window === "undefined") return "auto";
    const saved = localStorage.getItem("lang");
    return saved || "auto";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!lang || lang === "auto") {
      localStorage.removeItem("lang");
      const browser = navigator.language || "en";
      const base = browser.split("-")[0];
      const detected = base === "zh" ? "zh" : "en";
      import("@/i18n").then((i) => i.default.changeLanguage(detected));
    } else {
      localStorage.setItem("lang", lang);
      import("@/i18n").then((i) => i.default.changeLanguage(lang));
    }
  }, [lang]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h3 className="text-xl font-bold tracking-tight">
          {t("general.title")}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("general.description")}
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-sm mb-1">
                {t("general.theme")}
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {t("general.theme_desc")}
              </p>
            </div>

            <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-1">
              {[
                {
                  id: "system",
                  label: t("general.theme_system"),
                  icon: <MonitorIcon className="size-4" />,
                },
                {
                  id: "light",
                  label: t("general.theme_light"),
                  icon: <SunIcon className="size-4" />,
                },
                {
                  id: "dark",
                  label: t("general.theme_dark"),
                  icon: <MoonIcon className="size-4" />,
                },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                    theme === t.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-sm mb-1">
                {t("general.language_title")}
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {t("general.language_desc")}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Select onValueChange={(v) => setLang(v)} value={lang}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder={t("general.language_auto")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {t("general.language_auto")}
                  </SelectItem>
                  <SelectItem value="zh">{t("general.language_zh")}</SelectItem>
                  <SelectItem value="en">{t("general.language_en")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DataSettingsProps {
  onDataChange?: () => Promise<void>;
  isImporting: boolean;
  setIsImporting: (value: boolean) => void;
  importTask: Task | null;
  setImportTask: (task: Task | null) => void;
  subscribeToTask: (taskId: string) => void;
}

function DataSettings({
  onDataChange,
  isImporting,
  setIsImporting,
  importTask,
  setImportTask,
  subscribeToTask,
}: DataSettingsProps) {
  const { t } = useTranslation();
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [clearingIcons, setClearingIcons] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportOpml = () => {
    window.open("/api/opml", "_blank");
  };

  const handleImportOpml = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      setMessage(null);
      setImportTask(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/opml/import", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to import");
        }

        // Subscribe to task updates via SSE
        subscribeToTask(data.taskId);
      } catch (err) {
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to import OPML",
        });
        setIsImporting(false);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [setIsImporting, setImportTask, subscribeToTask],
  );

  const handleCancelImport = async () => {
    if (!importTask) return;

    try {
      await fetch(`/api/tasks/${importTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    } catch {
      // Ignore errors
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    setMessage(null);

    try {
      const res = await fetch("/api/articles/mark-all-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      setMessage({
        type: "success",
        text: t("data.marked_read", { count: data.count }),
      });
      onDataChange?.();
    } catch {
      setMessage({
        type: "error",
        text: t("data.failed_mark_read"),
      });
    } finally {
      setMarkingAllRead(false);
    }
  };

  const handleCleanup = async (days: number) => {
    setCleaning(true);
    setMessage(null);

    try {
      const res = await fetch("/api/articles/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays: days, readOnly: true }),
      });

      const data = await res.json();
      setMessage({
        type: "success",
        text: t("data.cleaned_up", { count: data.count }),
      });
      onDataChange?.();
    } catch {
      setMessage({
        type: "error",
        text: t("data.failed_cleanup"),
      });
    } finally {
      setCleaning(false);
    }
  };

  const handleClearIcons = async () => {
    setClearingIcons(true);
    setMessage(null);

    try {
      const res = await fetch("/api/feeds/clear-icons", {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({
          type: "success",
          text: t("data.icons_cleared_summary", {
            duration: data.duration,
            success: data.successCount,
            fail: data.failCount,
            total: data.total,
            uniqueDomains: data.uniqueDomains,
          }),
        });
        onDataChange?.();
      } else {
        throw new Error("Failed to clear icons");
      }
    } catch {
      setMessage({
        type: "error",
        text: t("data.failed_clear_icons"),
      });
    } finally {
      setClearingIcons(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h3 className="text-xl font-bold tracking-tight">{t("data.title")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("data.description")}
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm font-medium animate-in slide-in-from-top-2 duration-300 ${
            message.type === "success"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircleIcon className="size-4" />
            ) : (
              <AlertCircleIcon className="size-4" />
            )}
            {message.text}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Import/Export OPML */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">{t("data.opml_title")}</h4>
              <p className="text-[11px] text-muted-foreground">
                {t("data.opml_desc")}
              </p>
            </div>
          </div>

          {/* Import Progress */}
          {importTask &&
            (importTask.status === "running" ||
              importTask.status === "pending") && (
              <div className="mt-4 space-y-3 p-3 rounded-lg bg-muted/30 border border-muted/50">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-2 text-primary">
                    <LoaderIcon className="size-3 animate-spin" />
                    <span>{t("data.importing")}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {importTask.progress.current} / {importTask.progress.total}
                  </span>
                </div>
                <Progress
                  value={
                    importTask.progress.total > 0
                      ? (importTask.progress.current /
                          importTask.progress.total) *
                        100
                      : 0
                  }
                  className="h-1.5 bg-muted"
                />
                {importTask.progress.message && (
                  <div className="text-[11px] text-muted-foreground truncate italic opacity-70">
                    {importTask.progress.message}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs text-destructive hover:bg-destructive/10 rounded-md mt-1"
                  onClick={handleCancelImport}
                >
                  <StopCircleIcon className="mr-2 size-3.5" />
                  {t("actions.cancel_import")}
                </Button>
              </div>
            )}

          {/* Buttons */}
          {!isImporting && (
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportOpml}
                className="rounded-md h-8 px-3 text-xs font-semibold"
              >
                <DownloadIcon className="mr-2 size-3.5" />
                {t("actions.export")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md h-8 px-3 text-xs font-semibold"
              >
                <UploadIcon className="mr-2 size-3.5" />
                {t("actions.import")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".opml,.xml"
                onChange={handleImportOpml}
                className="hidden"
              />
            </div>
          )}
        </div>

        {/* Mark All Read */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">
                {t("feeds.mark_all_title")}
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {t("feeds.mark_all_desc")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAllRead}
              className="rounded-md h-8 px-3 text-xs font-semibold whitespace-nowrap"
            >
              {markingAllRead ? (
                <LoaderIcon className="mr-2 size-3.5 animate-spin" />
              ) : (
                <CheckCircleIcon className="mr-2 size-3.5" />
              )}
              {t("feeds.mark_all_button")}
            </Button>
          </div>
        </div>

        {/* Cleanup */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <div className="space-y-1 mb-4">
            <h4 className="font-semibold text-sm">
              {t("feeds.cleanup_title")}
            </h4>
            <p className="text-[11px] text-muted-foreground">
              {t("feeds.cleanup_desc")}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCleanup(7)}
              disabled={cleaning}
              className="rounded-md h-8 px-3 text-xs font-semibold hover:bg-muted"
            >
              <Trash2Icon className="mr-2 size-3.5" />
              {t("feeds.cleanup_7_days")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCleanup(30)}
              disabled={cleaning}
              className="rounded-md h-8 px-3 text-xs font-semibold hover:bg-muted"
            >
              <Trash2Icon className="mr-2 size-3.5" />
              {t("feeds.cleanup_30_days")}
            </Button>
          </div>
        </div>

        {/* Clear Icon Cache */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">
                {t("data.clear_icons_title")}
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {t("data.clear_icons_desc")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearIcons}
              disabled={clearingIcons}
              className="rounded-md h-8 px-3 text-xs font-semibold whitespace-nowrap"
            >
              {clearingIcons ? (
                <LoaderIcon className="mr-2 size-3.5 animate-spin" />
              ) : (
                <Trash2Icon className="mr-2 size-3.5" />
              )}
              {t("actions.clear_cache")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DebugSettings() {
  const { t } = useTranslation();
  const [userAgent, setUserAgent] = useState("");
  const [savedUserAgent, setSavedUserAgent] = useState("");
  const [fallbackUserAgent, setFallbackUserAgent] = useState("");
  const [savedFallbackUserAgent, setSavedFallbackUserAgent] = useState("");
  const [refreshInterval, setRefreshInterval] = useState(
    DEFAULT_REFRESH_INTERVAL.toString(),
  );
  const [savedRefreshInterval, setSavedRefreshInterval] = useState(
    DEFAULT_REFRESH_INTERVAL.toString(),
  );
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [clearingIcons, setClearingIcons] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        const settings = await res.json();
        const ua = settings.userAgent || "";
        const fallbackUa = settings.fallbackUserAgent || "";
        const interval =
          settings.refreshInterval || DEFAULT_REFRESH_INTERVAL.toString();
        const em = settings.email || "";
        setUserAgent(ua);
        setSavedUserAgent(ua);
        setFallbackUserAgent(fallbackUa);
        setSavedFallbackUserAgent(fallbackUa);
        setRefreshInterval(interval);
        setSavedRefreshInterval(interval);
        setEmail(em);
        setSavedEmail(em);
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAgent: userAgent || "",
          fallbackUserAgent: fallbackUserAgent || "",
          refreshInterval:
            refreshInterval || DEFAULT_REFRESH_INTERVAL.toString(),
          email: email || "",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      setSavedUserAgent(userAgent);
      setSavedFallbackUserAgent(fallbackUserAgent);
      setSavedRefreshInterval(refreshInterval);
      setSavedEmail(email);

      // Restart server-side auto refresh with new interval
      await fetch("/api/auto-refresh", { method: "POST" });

      setMessage({ type: "success", text: t("advanced.settings_saved") });
    } catch {
      setMessage({ type: "error", text: t("advanced.failed_save_settings") });
    } finally {
      setSaving(false);
    }
  };

  const handleResetUA = () => {
    setUserAgent("");
  };

  const handleUseDefaultUA = () => {
    setUserAgent(CHROME_USER_AGENT);
  };

  const handleResetInterval = () => {
    setRefreshInterval(DEFAULT_REFRESH_INTERVAL.toString());
  };

  const handleClearCache = async (type: "readability" | "content" | "all") => {
    setClearingCache(true);
    setMessage(null);

    try {
      const res = await fetch("/api/cache/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to clear cache");
      }

      const messages: string[] = [];
      if (data.readabilityCleared > 0) {
        messages.push(`${data.readabilityCleared} readability`);
      }
      if (data.contentCleared > 0) {
        messages.push(`${data.contentCleared} content`);
      }

      setMessage({
        type: "success",
        text:
          messages.length > 0
            ? t("advanced.cleared_summary", { items: messages.join(", ") })
            : t("advanced.no_cache"),
      });
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : t("advanced.failed_clear_cache"),
      });
    } finally {
      setClearingCache(false);
    }
  };

  const handleClearIcons = async () => {
    setClearingIcons(true);
    setMessage(null);

    try {
      const res = await fetch("/api/feeds/clear-icons", {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({
          type: "success",
          text: t("data.icons_cleared_summary", {
            duration: data.duration,
            success: data.successCount,
            fail: data.failCount,
            total: data.total,
            uniqueDomains: data.uniqueDomains,
          }),
        });
      } else {
        throw new Error("Failed to clear icons");
      }
    } catch {
      setMessage({
        type: "error",
        text: t("data.failed_clear_icons"),
      });
    } finally {
      setClearingIcons(false);
    }
  };

  const hasChanges =
    userAgent !== savedUserAgent ||
    fallbackUserAgent !== savedFallbackUserAgent ||
    refreshInterval !== savedRefreshInterval ||
    email !== savedEmail;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h3 className="text-xl font-bold tracking-tight">
          {t("advanced.title")}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("advanced.description")}
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm font-medium animate-in slide-in-from-top-2 duration-300 ${
            message.type === "success"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {/* Refresh Interval */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">
            {t("advanced.auto_refresh_title")}
          </h4>
          <p className="text-[11px] text-muted-foreground mb-4">
            {t("advanced.auto_refresh_desc")}
          </p>

          {loading ? (
            <div className="h-20 flex items-center justify-center">
              <LoaderIcon className="size-4 animate-spin text-muted-foreground/30" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="0"
                  max="1440"
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(e.target.value)}
                  className="w-24 rounded-md border-muted-foreground/20"
                />
                <span className="text-sm font-medium text-muted-foreground">
                  {t("units.minutes")}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {["5", "15", "30", "60", "0"].map((v) => (
                  <Button
                    key={v}
                    variant={refreshInterval === v ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setRefreshInterval(v)}
                    className="rounded-md h-8 px-4 text-[11px] font-bold"
                  >
                    {v === "0"
                      ? t("common.off")
                      : v === "60"
                        ? t("common.1h")
                        : `${v}m`}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gravatar Email */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">
            {t("advanced.avatar_service")}
          </h4>
          <p className="text-[11px] text-muted-foreground mb-4">
            {t("advanced.avatar_desc")}
          </p>

          {!loading && (
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("advanced.avatar_placeholder")}
              className="max-w-[320px] rounded-md border-muted-foreground/20"
            />
          )}
        </div>

        {/* User-Agent */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">
            {t("advanced.user_agent_title")}
          </h4>
          <p className="text-[11px] text-muted-foreground mb-4">
            {t("advanced.user_agent_desc")}
          </p>

          {!loading && (
            <div className="space-y-4">
              <Input
                value={userAgent}
                onChange={(e) => setUserAgent(e.target.value)}
                placeholder={t("advanced.default_agent_placeholder")}
                className="font-mono text-[11px] rounded-md border-muted-foreground/20 bg-muted/20"
              />

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUseDefaultUA}
                  className="rounded-md h-8 text-[11px] font-bold hover:bg-muted"
                >
                  {t("advanced.chrome_default")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetUA}
                  className="rounded-md h-8 text-[11px] font-bold hover:bg-muted"
                >
                  {t("actions.reset")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Fallback User-Agent */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">
            {t("advanced.fallback_ua_title")}
          </h4>
          <p className="text-[11px] text-muted-foreground mb-4">
            {t("advanced.fallback_ua_desc")}
          </p>

          {!loading && (
            <div className="space-y-2">
              <Input
                value={fallbackUserAgent}
                onChange={(e) => setFallbackUserAgent(e.target.value)}
                placeholder="Gist/1.0.0 (your-email@example.com)"
                className="font-mono text-[11px] rounded-md border-muted-foreground/20 bg-muted/20"
              />
              <p className="text-[10px] text-muted-foreground">
                {t("advanced.fallback_ua_hint")}
              </p>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="rounded-md px-6 h-9 font-bold shadow-lg shadow-primary/20"
          >
            {saving ? (
              <LoaderIcon className="size-4 animate-spin mr-2" />
            ) : null}
            {t("actions.save_changes")}
          </Button>
        </div>

        <Separator className="my-8" />

        {/* Clear Cache */}
        <div className="rounded-xl border border-destructive/20 p-4 bg-destructive/[0.02]">
          <h4 className="font-semibold text-sm text-destructive mb-1">
            {t("danger.title")}
          </h4>
          <p className="text-[11px] text-muted-foreground mb-4">
            {t("danger.description")}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleClearCache("content")}
              disabled={clearingCache || clearingIcons}
              className="rounded-md h-8 text-[11px] font-bold border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
            >
              {t("actions.clear_rss_content")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleClearCache("readability")}
              disabled={clearingCache || clearingIcons}
              className="rounded-md h-8 text-[11px] font-bold border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
            >
              {t("actions.clear_readability")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearIcons}
              disabled={clearingCache || clearingIcons}
              className="rounded-md h-8 text-[11px] font-bold border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
            >
              {clearingIcons && (
                <LoaderIcon className="mr-1.5 size-3 animate-spin" />
              )}
              {t("actions.clear_feed_icons")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleClearCache("all")}
              disabled={clearingCache || clearingIcons}
              className="rounded-md h-8 text-[11px] font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("actions.clear_all_cache")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AISettings() {
  const { t } = useTranslation();
  const [aiProvider, setAiProvider] = useState<
    "openai" | "anthropic" | "openai-compatible"
  >("openai");
  const [savedAiProvider, setSavedAiProvider] = useState<
    "openai" | "anthropic" | "openai-compatible"
  >("openai");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [savedAiBaseUrl, setSavedAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [savedAiApiKey, setSavedAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [savedAiModel, setSavedAiModel] = useState("");
  const [aiLanguage, setAiLanguage] = useState("English");
  const [savedAiLanguage, setSavedAiLanguage] = useState("English");
  const [aiAutoTranslate, setAiAutoTranslate] = useState(false);
  const [savedAiAutoTranslate, setSavedAiAutoTranslate] = useState(false);
  const [aiQps, setAiQps] = useState("2");
  const [savedAiQps, setSavedAiQps] = useState("2");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        const settings = await res.json();
        const provider = (settings.aiProvider || "openai") as
          | "openai"
          | "anthropic"
          | "openai-compatible";
        const baseUrl = settings.aiBaseUrl || "";
        const apiKey = settings.aiApiKey || "";
        const model = settings.aiModel || "";
        const language = settings.aiLanguage || "English";
        const autoTranslate = settings.aiAutoTranslate === "true";
        const qps = settings.aiQps || "2";

        setAiProvider(provider);
        setSavedAiProvider(provider);
        setAiBaseUrl(baseUrl);
        setSavedAiBaseUrl(baseUrl);
        setAiApiKey(apiKey);
        setSavedAiApiKey(apiKey);
        setAiModel(model);
        setSavedAiModel(model);
        setAiLanguage(language);
        setSavedAiLanguage(language);
        setAiAutoTranslate(autoTranslate);
        setSavedAiAutoTranslate(autoTranslate);
        setAiQps(qps);
        setSavedAiQps(qps);
      } catch (err) {
        console.error("Failed to fetch AI settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setTestResult(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiProvider,
          aiBaseUrl: aiBaseUrl || "",
          aiApiKey: aiApiKey || "",
          aiModel: aiModel || "",
          aiLanguage: aiLanguage || "English",
          aiAutoTranslate: aiAutoTranslate ? "true" : "false",
          aiQps: aiQps || "2",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      setSavedAiProvider(aiProvider);
      setSavedAiBaseUrl(aiBaseUrl);
      setSavedAiApiKey(aiApiKey);
      setSavedAiModel(aiModel);
      setSavedAiLanguage(aiLanguage);
      setSavedAiAutoTranslate(aiAutoTranslate);
      setSavedAiQps(aiQps);

      setMessage({ type: "success", text: t("ai.settings_saved") });
    } catch {
      setMessage({ type: "error", text: t("ai.failed_save") });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!aiApiKey) {
      setMessage({ type: "error", text: "Please enter an API key first" });
      return;
    }

    setTesting(true);
    setMessage(null);
    setTestResult(null);

    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiProvider,
          baseUrl: aiBaseUrl || undefined,
          apiKey: aiApiKey,
          model: aiModel || undefined,
          language: aiLanguage || "English",
          prompt: "RSS is the best!",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Test failed");
      }

      setTestResult(data.response);
      setMessage({ type: "success", text: "AI connection test successful" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleResetBaseUrl = () => {
    if (aiProvider === "openai") {
      setAiBaseUrl("https://api.openai.com/v1");
    } else if (aiProvider === "anthropic") {
      setAiBaseUrl("https://api.anthropic.com/v1");
    } else {
      setAiBaseUrl("http://localhost:11434/v1");
    }
  };

  const hasChanges =
    aiProvider !== savedAiProvider ||
    aiBaseUrl !== savedAiBaseUrl ||
    aiApiKey !== savedAiApiKey ||
    aiModel !== savedAiModel ||
    aiLanguage !== savedAiLanguage ||
    aiAutoTranslate !== savedAiAutoTranslate ||
    aiQps !== savedAiQps;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h3 className="text-xl font-bold tracking-tight">{t("ai.title")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("ai.description")}
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm font-medium animate-in slide-in-from-top-2 duration-300 ${
            message.type === "success"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircleIcon className="size-4" />
            ) : (
              <AlertCircleIcon className="size-4" />
            )}
            {message.text}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* AI Provider */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">{t("ai.title")}</h4>
          <p className="text-[11px] text-muted-foreground mb-3">
            {t("ai.provider_desc")}
          </p>

          {loading ? (
            <div className="h-10 flex items-center justify-center">
              <LoaderIcon className="size-4 animate-spin text-muted-foreground/30" />
            </div>
          ) : (
            <Select
              value={aiProvider}
              onValueChange={(value) =>
                setAiProvider(
                  value as "openai" | "anthropic" | "openai-compatible",
                )
              }
            >
              <SelectTrigger className="w-full rounded-md border-muted-foreground/20 bg-muted/20">
                <SelectValue placeholder={t("ai.select_provider")} />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-xl border-muted/40">
                <SelectItem value="openai">
                  {t("ai.provider_openai")}
                </SelectItem>
                <SelectItem value="anthropic">
                  {t("ai.provider_anthropic")}
                </SelectItem>
                <SelectItem value="openai-compatible">
                  {t("ai.provider_openai_compatible")}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Base URL */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">{t("ai.base_url")}</h4>
          <p className="text-[11px] text-muted-foreground mb-3">
            {t("ai.base_url_desc")}
          </p>

          {!loading && (
            <div className="space-y-3">
              <Input
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder={
                  aiProvider === "openai"
                    ? "https://api.openai.com/v1"
                    : aiProvider === "anthropic"
                      ? "https://api.anthropic.com/v1"
                      : "http://localhost:11434/v1"
                }
                className="font-mono text-[11px] rounded-md border-muted-foreground/20 bg-muted/20"
              />

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetBaseUrl}
                  className="rounded-md h-8 text-[11px] font-bold hover:bg-muted"
                >
                  {t("ai.use_default")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAiBaseUrl("")}
                  className="rounded-md h-8 text-[11px] font-bold hover:bg-muted"
                >
                  {t("ai.clear")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Model */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">{t("ai.model_name")}</h4>
          <p className="text-[11px] text-muted-foreground mb-3">
            {t("ai.model_desc")}
          </p>

          {!loading && (
            <Input
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder={
                aiProvider === "openai"
                  ? "gpt-4o-mini"
                  : aiProvider === "anthropic"
                    ? "claude-3-5-haiku-20241022"
                    : "llama3.2"
              }
              className="font-mono text-[11px] rounded-md border-muted-foreground/20 bg-muted/20"
            />
          )}
        </div>

        {/* API Key */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">{t("ai.api_key")}</h4>
          <p className="text-[11px] text-muted-foreground mb-3">
            {t("ai.api_key_desc")}
          </p>

          {!loading && (
            <Input
              type="password"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder="sk-..."
              className="font-mono text-[11px] rounded-md border-muted-foreground/20 bg-muted/20"
            />
          )}
        </div>

        {/* Output Language */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">
            {t("ai.output_language")}
          </h4>
          <p className="text-[11px] text-muted-foreground mb-3">
            {t("ai.output_language_desc")}
          </p>

          {loading ? (
            <div className="h-10 flex items-center justify-center">
              <LoaderIcon className="size-4 animate-spin text-muted-foreground/30" />
            </div>
          ) : (
            <Select value={aiLanguage} onValueChange={setAiLanguage}>
              <SelectTrigger className="w-full rounded-md border-muted-foreground/20 bg-muted/20">
                <SelectValue placeholder={t("ai.select_language")} />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-xl border-muted/40">
                <SelectItem value="English">{t("ai.lang_en")}</SelectItem>
                <SelectItem value="Chinese">{t("ai.lang_zh")}</SelectItem>
                <SelectItem value="Japanese">{t("ai.lang_ja")}</SelectItem>
                <SelectItem value="Korean">{t("ai.lang_ko")}</SelectItem>
                <SelectItem value="French">{t("ai.lang_fr")}</SelectItem>
                <SelectItem value="German">{t("ai.lang_de")}</SelectItem>
                <SelectItem value="Spanish">{t("ai.lang_es")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Auto Translate */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">
                {t("ai.auto_translate")}
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {t("ai.auto_translate_desc")}
              </p>
            </div>

            {!loading && (
              <button
                type="button"
                role="switch"
                aria-checked={aiAutoTranslate}
                onClick={() => setAiAutoTranslate(!aiAutoTranslate)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  aiAutoTranslate ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    aiAutoTranslate ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Rate Limit (QPS) */}
        <div className="rounded-xl border border-muted/40 p-4 bg-card transition-all hover:border-muted-foreground/20">
          <h4 className="font-semibold text-sm mb-1">{t("ai.rate_limit")}</h4>
          <p className="text-[11px] text-muted-foreground mb-3">
            {t("ai.rate_limit_desc")}
          </p>

          {!loading && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={aiQps}
                  onChange={(e) => setAiQps(e.target.value)}
                  className="w-24 rounded-md border-muted-foreground/20"
                />
                <span className="text-sm font-medium text-muted-foreground">
                  {t("ai.requests_per_second")}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {["0.5", "1", "2", "5"].map((v) => (
                  <Button
                    key={v}
                    variant={aiQps === v ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setAiQps(v)}
                    className="rounded-md h-8 px-3 text-[11px] font-bold"
                  >
                    {v}/s
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <div className="rounded-xl border border-muted/40 p-4 bg-card">
            <h4 className="font-semibold text-sm mb-1">
              {t("ai.test_response")}
            </h4>
            <p className="text-[11px] text-muted-foreground mb-2">
              {t("ai.test_response_desc", { prompt: "RSS is the best!" })}
            </p>
            <div className="p-3 rounded-lg bg-muted/30 text-sm leading-relaxed">
              {testResult}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-1">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || !aiApiKey}
            className="rounded-md px-5 h-9 font-bold"
          >
            {testing ? (
              <LoaderIcon className="size-4 animate-spin mr-2" />
            ) : null}
            {t("actions.test_connection")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="rounded-md px-6 h-9 font-bold shadow-lg shadow-primary/20"
          >
            {saving ? (
              <LoaderIcon className="size-4 animate-spin mr-2" />
            ) : null}
            {t("actions.save_configuration")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AboutSettings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col items-center py-8 text-center">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-2xl shadow-primary/40 mb-6 rotate-3 transition-transform hover:rotate-0">
          <RssIcon className="size-10" />
        </div>
        <h4 className="text-3xl font-black tracking-tighter">
          {t("app.name")}
        </h4>
        <p className="text-xs font-bold text-primary/60 tracking-widest uppercase mt-1.5">
          {t("app.version")}
        </p>

        <div className="max-w-[420px] mt-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("app.description")}
          </p>
        </div>
      </div>
    </div>
  );
}

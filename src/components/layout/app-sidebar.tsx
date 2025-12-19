"use client";

import { useState, useEffect, useMemo } from "react";
import { getGravatarUrl } from "@/lib/gravatar";
import {
  RssIcon,
  RefreshCwIcon,
  Trash2Icon,
  MoreHorizontalIcon,
  SettingsIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FileTextIcon,
  PlusIcon,
  LayoutGridIcon,
  UserIcon,
  InfoIcon,
  ArrowDownAZIcon,
  CalendarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddFeedDialog } from "@/components/add-feed-dialog";
import { AddFolderDialog } from "@/components/add-folder-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { Feed, Folder } from "@/lib/types";

interface AppSidebarProps {
  feeds: Feed[];
  folders: Folder[];
  selectedFeedId: string | null;
  selectedFolderId?: string | null;
  onSelectFeed: (feedId: string | null) => void;
  onSelectFolder?: (folderId: string) => void;
  onAddFeed: (url: string) => Promise<void>;
  onRefreshFeed: (feedId: string) => Promise<void>;
  onDeleteFeed: (feedId: string) => Promise<void>;
  onRefreshAllFeeds: () => Promise<void>;
  onAddFolder: (name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onMoveFeedToFolder: (
    feedId: string,
    folderId: string | null,
  ) => Promise<void>;
  onDataChange?: () => Promise<void>;
}

export function AppSidebar({
  feeds,
  folders,
  selectedFeedId,
  selectedFolderId,
  onSelectFeed,
  onSelectFolder,
  onAddFeed,
  onRefreshFeed,
  onDeleteFeed,
  onRefreshAllFeeds,
  onAddFolder,
  onDeleteFolder,
  onRenameFolder,
  onMoveFeedToFolder,
  onDataChange,
}: AppSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [email, setEmail] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "date">("name");

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((settings) => setEmail(settings.email || ""))
      .catch(() => {});
  }, []);

  const totalUnread = feeds.reduce(
    (sum, feed) => sum + feed._count.articles,
    0,
  );
  const uncategorizedFeeds = feeds.filter((feed) => !feed.folderId);

  // Custom sort function: ASCII (English/Numbers) first, then others (Chinese, etc.)
  const compareNames = (nameA: string, nameB: string) => {
    const isAsciiA = /^[\u0000-\u007f]/.test(nameA);
    const isAsciiB = /^[\u0000-\u007f]/.test(nameB);

    if (isAsciiA && !isAsciiB) return -1;
    if (!isAsciiA && isAsciiB) return 1;

    return nameA.localeCompare(nameB, "zh-CN");
  };

  // Memoized sorted data to ensure consistency and performance
  const sortedFolders = useMemo(() => {
    if (sortBy === "date") {
      // Sort by createdAt asc (Oldest first)
      return [...folders].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    // Default: Sort by name
    return [...folders].sort((a, b) => compareNames(a.name, b.name));
  }, [folders, sortBy]);

  const sortedUncategorizedFeeds = useMemo(() => {
    if (sortBy === "date") {
      // Sort by createdAt asc (Oldest first)
      return [...uncategorizedFeeds].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    // Default: Sort by name
    return [...uncategorizedFeeds].sort((a, b) =>
      compareNames(a.title, b.title),
    );
  }, [uncategorizedFeeds, sortBy]);

  const { t } = useTranslation();

  const getSortedFolderFeeds = (folderId: string) => {
    const folderFeeds = feeds.filter((feed) => feed.folderId === folderId);
    if (sortBy === "date") {
      // Sort by createdAt asc (Oldest first)
      return [...folderFeeds].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    // Default: Sort by name
    return [...folderFeeds].sort((a, b) => compareNames(a.title, b.title));
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const getFolderUnreadCount = (folderId: string) => {
    return feeds
      .filter((feed) => feed.folderId === folderId)
      .reduce((sum, feed) => sum + feed._count.articles, 0);
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <LayoutGridIcon className="h-5 w-5 text-orange-500" />
          <span>{t("app.name")}</span>
        </div>
        <div className="flex items-center gap-1">
          <AddFolderDialog onAdd={onAddFolder}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <FolderPlusIcon className="h-4 w-4" />
            </Button>
          </AddFolderDialog>
          <AddFeedDialog onAdd={onAddFeed}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </AddFeedDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                {email ? (
                  <img
                    src={getGravatarUrl(email, 40)}
                    alt=""
                    className="size-5 rounded-full"
                  />
                ) : (
                  <div className="flex size-5 items-center justify-center rounded-full bg-muted">
                    <UserIcon className="size-3 text-muted-foreground" />
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <SettingsDialog
                feeds={feeds}
                folders={folders}
                onRefreshFeed={onRefreshFeed}
                onDeleteFeed={onDeleteFeed}
                onRefreshAllFeeds={onRefreshAllFeeds}
                onAddFolder={onAddFolder}
                onDeleteFolder={onDeleteFolder}
                onRenameFolder={onRenameFolder}
                onMoveFeedToFolder={onMoveFeedToFolder}
                onDataChange={onDataChange}
              >
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <SettingsIcon className="mr-2 size-4" />
                  {t("settings.title")}
                </DropdownMenuItem>
              </SettingsDialog>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <InfoIcon className="mr-2 size-4" />
                <span className="text-muted-foreground">
                  {t("app.version")}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        {/* Main Links */}
        <div className="space-y-1">
          <button
            onClick={() => onSelectFeed(null)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              selectedFeedId === null && selectedFolderId === null
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
            )}
          >
            <FileTextIcon className="size-4" />
            <span>{t("nav.articles")}</span>
            {totalUnread > 0 && (
              <span className="ml-auto text-xs font-normal opacity-70">
                {totalUnread}
              </span>
            )}
          </button>
        </div>

        {/* Folders & Feeds */}
        {(folders.length > 0 || uncategorizedFeeds.length > 0) && (
          <div className="space-y-1">
            {/* Sort Header */}
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                {t("sidebar.feeds")}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  >
                    {sortBy === "name" ? (
                      <ArrowDownAZIcon className="h-3.5 w-3.5" />
                    ) : (
                      <CalendarIcon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => setSortBy("name")}
                    className={cn(sortBy === "name" && "bg-accent")}
                  >
                    <ArrowDownAZIcon className="mr-2 h-4 w-4" />
                    {t("sidebar.sort_name")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setSortBy("date")}
                    className={cn(sortBy === "date" && "bg-accent")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {t("sidebar.sort_date")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {sortedFolders.map((folder) => {
              const isExpanded = expandedFolders.has(folder.id);
              const folderFeeds = getSortedFolderFeeds(folder.id);
              const unreadCount = getFolderUnreadCount(folder.id);

              return (
                <div key={folder.id} className="space-y-1">
                  <div
                    className={cn(
                      "group relative flex items-center gap-0.5 rounded-md pr-8 transition-colors",
                      selectedFolderId === folder.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/50",
                    )}
                  >
                    {/* Expand/Collapse Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolder(folder.id);
                      }}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        selectedFolderId === folder.id
                          ? "text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-3.5 shrink-0 transition-transform duration-200",
                          isExpanded && "rotate-90",
                        )}
                      />
                    </button>

                    {/* Folder Selection Button */}
                    <button
                      onClick={() => onSelectFolder?.(folder.id)}
                      className={cn(
                        "flex-1 flex items-center gap-2 py-1.5 text-sm font-medium transition-colors rounded-md px-1.5",
                        selectedFolderId === folder.id
                          ? "text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {isExpanded ? (
                        <FolderOpenIcon className="size-4 shrink-0" />
                      ) : (
                        <FolderIcon className="size-4 shrink-0" />
                      )}
                      <span className="truncate">{folder.name}</span>
                    </button>

                    {/* Unread Count */}
                    {unreadCount > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-normal opacity-70 transition-opacity duration-200 group-hover:opacity-0 group-has-[[data-state=open]]:opacity-0">
                        {unreadCount}
                      </span>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 size-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                        >
                          <MoreHorizontalIcon className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem
                          onClick={() => onDeleteFolder(folder.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2Icon className="mr-2 size-4" />
                          {t("folders.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {isExpanded && (
                    <div className="ml-3 border-l border-border/50 pl-2 space-y-0.5">
                      {folderFeeds.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                          {t("folders.empty")}
                        </div>
                      ) : (
                        folderFeeds.map((feed) => (
                          <FeedItem
                            key={feed.id}
                            feed={feed}
                            isSelected={selectedFeedId === feed.id}
                            folders={folders}
                            onSelect={() => onSelectFeed(feed.id)}
                            onRefresh={() => onRefreshFeed(feed.id)}
                            onDelete={() => onDeleteFeed(feed.id)}
                            onMoveToFolder={onMoveFeedToFolder}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Uncategorized Feeds */}
            {sortedUncategorizedFeeds.length > 0 && (
              <div className="pt-2">
                {sortedFolders.length > 0 && (
                  <div className="mb-2 px-2 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                    {t("sidebar.uncategorized")}
                  </div>
                )}
                <div className="space-y-0.5">
                  {sortedUncategorizedFeeds.map((feed) => (
                    <FeedItem
                      key={feed.id}
                      feed={feed}
                      isSelected={selectedFeedId === feed.id}
                      folders={folders}
                      onSelect={() => onSelectFeed(feed.id)}
                      onRefresh={() => onRefreshFeed(feed.id)}
                      onDelete={() => onDeleteFeed(feed.id)}
                      onMoveToFolder={onMoveFeedToFolder}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface FeedItemProps {
  feed: Feed;
  isSelected: boolean;
  folders: Folder[];
  onSelect: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  onMoveToFolder: (feedId: string, folderId: string | null) => Promise<void>;
}

function FeedItem({
  feed,
  isSelected,
  folders,
  onSelect,
  onRefresh,
  onDelete,
  onMoveToFolder,
}: FeedItemProps) {
  const { t } = useTranslation();

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
        )}
      >
        {feed.imageUrl ? (
          <img
            src={`/api/icons/${feed.imageUrl}`}
            alt=""
            className="size-3.5 rounded-sm shrink-0"
          />
        ) : (
          <RssIcon className="size-3.5 shrink-0" />
        )}
        <span className="truncate">{feed.title}</span>
        {feed._count.articles > 0 && (
          <span className="ml-auto text-xs opacity-70 transition-opacity duration-200 group-hover:opacity-0 group-has-[[data-state=open]]:opacity-0">
            {feed._count.articles}
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 size-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontalIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onClick={onRefresh}>
            <RefreshCwIcon className="mr-2 size-4" />
            {t("actions.refresh_feed")}
          </DropdownMenuItem>
          {folders.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderIcon className="mr-2 size-4" />
                  {t("actions.move_to_folder")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {feed.folderId && (
                    <DropdownMenuItem
                      onClick={() => onMoveToFolder(feed.id, null)}
                    >
                      {t("actions.remove_from_folder")}
                    </DropdownMenuItem>
                  )}
                  {folders
                    .filter((f) => f.id !== feed.folderId)
                    .map((folder) => (
                      <DropdownMenuItem
                        key={folder.id}
                        onClick={() => onMoveToFolder(feed.id, folder.id)}
                      >
                        {folder.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2Icon className="mr-2 size-4" />
            {t("actions.delete_feed")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

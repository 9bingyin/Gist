"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ImageIcon,
  BellIcon,
  TagIcon,
  StarIcon,
  CircleXIcon,
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
import { ErrorTooltip } from "@/components/ui/error-tooltip";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { Feed, Folder, ContentType } from "@/lib/types";

interface AppSidebarProps {
  feeds: Feed[];
  folders: Folder[];
  selectedFeedId: string | null;
  selectedFolderId?: string | null;
  selectedContentType: ContentType;
  isStarredView?: boolean;
  onSelectFeed: (feedId: string | null) => void;
  onSelectFolder?: (folderId: string) => void;
  onSelectContentType: (type: ContentType) => void;
  onSelectStarred?: () => void;
  onAddFeed: (url: string, type: ContentType) => Promise<void>;
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
}

export function AppSidebar({
  feeds,
  folders,
  selectedFeedId,
  selectedFolderId,
  selectedContentType,
  isStarredView,
  onSelectFeed,
  onSelectFolder,
  onSelectContentType,
  onSelectStarred,
  onAddFeed,
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
}: AppSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [email, setEmail] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "date">("name");

  // Animation direction tracking
  const contentTypeList: ContentType[] = ["article", "picture", "notification"];
  const orderIndex = contentTypeList.indexOf(selectedContentType);

  const prevOrderIndexRef = useRef(-1);
  const [isReady, setIsReady] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [currentAnimatedType, setCurrentAnimatedType] = useState(selectedContentType);

  useLayoutEffect(() => {
    const prevOrderIndex = prevOrderIndexRef.current;
    if (prevOrderIndex !== orderIndex) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (prevOrderIndex < orderIndex) setDirection("right");
       
      else setDirection("left");
    }
    setTimeout(() => {
       
      setCurrentAnimatedType(selectedContentType);
    }, 0);
    if (prevOrderIndexRef.current !== -1) {
       
      setIsReady(true);
    }
    prevOrderIndexRef.current = orderIndex;
  }, [orderIndex, selectedContentType]);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data) => setEmail(data.user?.email || ""))
      .catch(() => {});
  }, []);

  // Filter feeds and folders by content type
  const filteredFeeds = useMemo(
    () => feeds.filter((feed) => feed.type === currentAnimatedType),
    [feeds, currentAnimatedType],
  );

  const filteredFolders = useMemo(
    () => folders.filter((folder) => folder.type === currentAnimatedType),
    [folders, currentAnimatedType],
  );

  // Calculate unread count for each content type
  const contentTypeCounts = useMemo(() => {
    const counts = {
      article: 0,
      picture: 0,
      notification: 0,
    };
    for (const feed of feeds) {
      counts[feed.type] += feed._count.articles;
    }
    return counts;
  }, [feeds]);

  const totalUnread = filteredFeeds.reduce(
    (sum, feed) => sum + feed._count.articles,
    0,
  );
  const uncategorizedFeeds = filteredFeeds.filter((feed) => !feed.folderId);

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
      return [...filteredFolders].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    // Default: Sort by name
    return [...filteredFolders].sort((a, b) => compareNames(a.name, b.name));
  }, [filteredFolders, sortBy]);

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
    const folderFeeds = filteredFeeds.filter((feed) => feed.folderId === folderId);
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
    return filteredFeeds
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
          <AddFolderDialog onAdd={onAddFolder} defaultType={selectedContentType}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <FolderPlusIcon className="h-4 w-4" />
            </Button>
          </AddFolderDialog>
          <AddFeedDialog onAdd={onAddFeed} defaultType={selectedContentType}>
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
              <DropdownMenuItem
                onSelect={() => onSelectStarred?.()}
                className={cn(isStarredView && "bg-accent")}
              >
                <StarIcon className="mr-2 size-4" />
                {t("nav.starred")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
                onChangeFeedType={onChangeFeedType}
                onChangeFolderType={onChangeFolderType}
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

      {/* Content Type Switcher */}
      <div className="relative mb-2 mt-3">
        <div className="flex h-11 items-center px-1 text-xl text-muted-foreground">
          <Button
            variant="ghost"
            onClick={() => onSelectContentType("article")}
            aria-label={t("content_type.article")}
            className={cn(
              "flex h-11 w-8 shrink-0 grow flex-col items-center justify-center gap-1 text-[1.375rem]",
              selectedContentType === "article"
                ? "text-lime-600 dark:text-lime-500"
                : "text-muted-foreground"
            )}
          >
            <FileTextIcon className="size-[1.375rem]" />
            <div className="text-[0.625rem] font-medium leading-none">
              {contentTypeCounts.article}
            </div>
          </Button>
          <Button
            variant="ghost"
            onClick={() => onSelectContentType("picture")}
            aria-label={t("content_type.picture")}
            className={cn(
              "flex h-11 w-8 shrink-0 grow flex-col items-center justify-center gap-1 text-[1.375rem]",
              selectedContentType === "picture"
                ? "text-lime-600 dark:text-lime-500"
                : "text-muted-foreground"
            )}
          >
            <ImageIcon className="size-[1.375rem]" />
            <div className="text-[0.625rem] font-medium leading-none">
              {contentTypeCounts.picture}
            </div>
          </Button>
          <Button
            variant="ghost"
            onClick={() => onSelectContentType("notification")}
            aria-label={t("content_type.notification")}
            className={cn(
              "flex h-11 w-8 shrink-0 grow flex-col items-center justify-center gap-1 text-[1.375rem]",
              selectedContentType === "notification"
                ? "text-lime-600 dark:text-lime-500"
                : "text-muted-foreground"
            )}
          >
            <BellIcon className="size-[1.375rem]" />
            <div className="text-[0.625rem] font-medium leading-none">
              {contentTypeCounts.notification}
            </div>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentAnimatedType}
            initial={isReady ? { x: direction === "right" ? "100%" : "-100%" } : false}
            animate={{ x: 0 }}
            exit={{ x: direction === "right" ? "-100%" : "100%" }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
            className="absolute inset-0 overflow-y-auto px-3 py-2 space-y-6"
        >
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
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <TagIcon className="mr-2 size-4" />
                            {t("actions.change_type")}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem
                              onClick={() => onChangeFolderType(folder.id, "article")}
                              className={cn(folder.type === "article" && "bg-accent")}
                            >
                              <FileTextIcon className="mr-2 size-4" />
                              {t("content_type.article")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onChangeFolderType(folder.id, "picture")}
                              className={cn(folder.type === "picture" && "bg-accent")}
                            >
                              <ImageIcon className="mr-2 size-4" />
                              {t("content_type.picture")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onChangeFolderType(folder.id, "notification")}
                              className={cn(folder.type === "notification" && "bg-accent")}
                            >
                              <BellIcon className="mr-2 size-4" />
                              {t("content_type.notification")}
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
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
                            onChangeType={onChangeFeedType}
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
                      onChangeType={onChangeFeedType}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
          </motion.div>
        </AnimatePresence>
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
  onChangeType: (feedId: string, type: ContentType) => Promise<void>;
}

function FeedItem({
  feed,
  isSelected,
  folders,
  onSelect,
  onRefresh,
  onDelete,
  onMoveToFolder,
  onChangeType,
}: FeedItemProps) {
  const { t } = useTranslation();
  const hasError = !!(feed.errorAt && feed.lastError);

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-8 text-sm transition-colors",
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
          hasError && "text-red-500",
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
        {hasError && (
          <ErrorTooltip errorAt={feed.errorAt} errorMessage={feed.lastError}>
            <CircleXIcon className="size-3.5 shrink-0 text-red-500" />
          </ErrorTooltip>
        )}
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <TagIcon className="mr-2 size-4" />
              {t("actions.change_type")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => onChangeType(feed.id, "article")}
                className={cn(feed.type === "article" && "bg-accent")}
              >
                <FileTextIcon className="mr-2 size-4" />
                {t("content_type.article")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onChangeType(feed.id, "picture")}
                className={cn(feed.type === "picture" && "bg-accent")}
              >
                <ImageIcon className="mr-2 size-4" />
                {t("content_type.picture")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onChangeType(feed.id, "notification")}
                className={cn(feed.type === "notification" && "bg-accent")}
              >
                <BellIcon className="mr-2 size-4" />
                {t("content_type.notification")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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

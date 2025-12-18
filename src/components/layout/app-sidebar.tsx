"use client";

import { useState } from "react";
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
  onMoveFeedToFolder: (feedId: string, folderId: string | null) => Promise<void>;
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const totalUnread = feeds.reduce((sum, feed) => sum + feed._count.articles, 0);
  const uncategorizedFeeds = feeds.filter((feed) => !feed.folderId);

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

  const getFolderFeeds = (folderId: string) => {
    return feeds.filter((feed) => feed.folderId === folderId);
  };

  const getFolderUnreadCount = (folderId: string) => {
    return getFolderFeeds(folderId).reduce(
      (sum, feed) => sum + feed._count.articles,
      0
    );
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <LayoutGridIcon className="h-5 w-5 text-orange-500" />
          <span>Gist</span>
        </div>
        <div className="flex items-center gap-1">
          <AddFolderDialog onAdd={onAddFolder}>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <FolderPlusIcon className="h-4 w-4" />
            </Button>
          </AddFolderDialog>
          <AddFeedDialog onAdd={onAddFeed}>
             <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <PlusIcon className="h-4 w-4" />
            </Button>
          </AddFeedDialog>
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
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
            )}
          >
            <FileTextIcon className="size-4" />
            <span>文章</span>
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
            {folders.map((folder) => {
              const isExpanded = expandedFolders.has(folder.id);
              const folderFeeds = getFolderFeeds(folder.id);
              const unreadCount = getFolderUnreadCount(folder.id);

              return (
                <div key={folder.id} className="space-y-1">
                  <div className="group relative flex items-center gap-0.5 rounded-md hover:bg-sidebar-accent/30 pr-8 transition-colors">
                    {/* Expand/Collapse Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolder(folder.id);
                      }}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-3.5 shrink-0 transition-transform duration-200",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </button>

                    {/* Folder Selection Button */}
                    <button
                      onClick={() => onSelectFolder?.(folder.id)}
                      className={cn(
                        "flex-1 flex items-center gap-2 py-1.5 text-sm font-medium transition-colors rounded-md px-1.5",
                        selectedFolderId === folder.id 
                          ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                          : "text-foreground hover:text-foreground"
                      )}
                    >
                      {isExpanded ? (
                        <FolderOpenIcon className="size-4 shrink-0" />
                      ) : (
                        <FolderIcon className="size-4 shrink-0" />
                      )}
                      <span className="truncate">{folder.name}</span>
                      {unreadCount > 0 && (
                        <span className="ml-auto text-xs text-muted-foreground transition-opacity duration-200 group-hover:opacity-0 group-has-[[data-state=open]]:opacity-0">
                          {unreadCount}
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
                        <DropdownMenuItem
                          onClick={() => onDeleteFolder(folder.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2Icon className="mr-2 size-4" />
                          删除文件夹
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {isExpanded && (
                    <div className="ml-3 border-l border-border/50 pl-2 space-y-0.5">
                      {folderFeeds.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                          空文件夹
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
            {uncategorizedFeeds.length > 0 && (
              <div className="pt-2">
                {folders.length > 0 && (
                  <div className="mb-2 px-2 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                    未分类
                  </div>
                )}
                <div className="space-y-0.5">
                  {uncategorizedFeeds.map((feed) => (
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

      {/* Footer */}
      <div className="p-3 mt-auto border-t border-border/50">
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
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-colors">
            <SettingsIcon className="size-4" />
            <span>设置</span>
          </button>
        </SettingsDialog>
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
  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isSelected 
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
        )}
      >
        {feed.imageUrl ? (
          <img src={feed.imageUrl} alt="" className="size-3.5 rounded-sm shrink-0" />
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
            刷新
          </DropdownMenuItem>
          {folders.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderIcon className="mr-2 size-4" />
                  移动到文件夹
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {feed.folderId && (
                    <DropdownMenuItem
                      onClick={() => onMoveToFolder(feed.id, null)}
                    >
                      移出文件夹
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
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2Icon className="mr-2 size-4" />
            删除订阅
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

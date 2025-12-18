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
  onSelectFeed: (feedId: string | null) => void;
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
  onSelectFeed,
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
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-orange-500 text-white">
          <RssIcon className="size-4" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5 leading-none min-w-0">
          <span className="font-semibold truncate">RSS Reader</span>
          <span className="text-xs text-muted-foreground">
            {feeds.length} feeds
          </span>
        </div>
        <AddFolderDialog onAdd={onAddFolder}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <FolderPlusIcon className="h-4 w-4" />
          </Button>
        </AddFolderDialog>
        <AddFeedDialog onAdd={onAddFeed} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {/* All Articles */}
        <div className="mb-4">
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
            All Articles
          </div>
          <button
            onClick={() => onSelectFeed(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              selectedFeedId === null
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            )}
          >
            <RssIcon className="size-4" />
            <span>All Feeds</span>
            {totalUnread > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {totalUnread}
              </span>
            )}
          </button>
        </div>

        {/* Folders */}
        {folders.length > 0 && (
          <div className="mb-4">
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Folders
            </div>
            <div className="space-y-0.5">
              {folders.map((folder) => {
                const isExpanded = expandedFolders.has(folder.id);
                const folderFeeds = getFolderFeeds(folder.id);
                const unreadCount = getFolderUnreadCount(folder.id);

                return (
                  <div key={folder.id}>
                    <div className="group relative">
                      <button
                        onClick={() => toggleFolder(folder.id)}
                        className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50 pr-8"
                      >
                        <ChevronRightIcon
                          className={cn(
                            "size-4 shrink-0 transition-transform",
                            isExpanded && "rotate-90"
                          )}
                        />
                        {isExpanded ? (
                          <FolderOpenIcon className="size-4 shrink-0" />
                        ) : (
                          <FolderIcon className="size-4 shrink-0" />
                        )}
                        <span className="truncate">{folder.name}</span>
                        {unreadCount > 0 && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            {unreadCount}
                          </span>
                        )}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 size-6 opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                          <DropdownMenuItem
                            onClick={() => onDeleteFolder(folder.id)}
                            className="text-red-600"
                          >
                            <Trash2Icon className="mr-2 size-4" />
                            Delete Folder
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Folder Feeds */}
                    {isExpanded && (
                      <div className="ml-4 space-y-0.5">
                        {folderFeeds.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            No feeds in this folder
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
            </div>
          </div>
        )}

        {/* Uncategorized Feeds */}
        {uncategorizedFeeds.length > 0 && (
          <div>
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {folders.length > 0 ? "Uncategorized" : "Subscriptions"}
            </div>
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

      {/* Footer */}
      <div className="border-t p-2">
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
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50">
            <SettingsIcon className="size-4" />
            <span>Settings</span>
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
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm pr-8",
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
        )}
      >
        {feed.imageUrl ? (
          <img src={feed.imageUrl} alt="" className="size-4 rounded shrink-0" />
        ) : (
          <RssIcon className="size-4 shrink-0" />
        )}
        <span className="truncate">{feed.title}</span>
        {feed._count.articles > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {feed._count.articles}
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 size-6 opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onClick={onRefresh}>
            <RefreshCwIcon className="mr-2 size-4" />
            Refresh
          </DropdownMenuItem>
          {folders.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderIcon className="mr-2 size-4" />
                  Move to Folder
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {feed.folderId && (
                    <DropdownMenuItem
                      onClick={() => onMoveToFolder(feed.id, null)}
                    >
                      Remove from Folder
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
          <DropdownMenuItem onClick={onDelete} className="text-red-600">
            <Trash2Icon className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

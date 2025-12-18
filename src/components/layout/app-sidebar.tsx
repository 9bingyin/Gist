"use client";

import { RssIcon, RefreshCwIcon, Trash2Icon, MoreHorizontalIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddFeedDialog } from "@/components/add-feed-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { cn } from "@/lib/utils";
import type { Feed } from "@/lib/types";

interface AppSidebarProps {
  feeds: Feed[];
  selectedFeedId: string | null;
  onSelectFeed: (feedId: string | null) => void;
  onAddFeed: (url: string) => Promise<void>;
  onRefreshFeed: (feedId: string) => Promise<void>;
  onDeleteFeed: (feedId: string) => Promise<void>;
  onRefreshAllFeeds: () => Promise<void>;
}

export function AppSidebar({
  feeds,
  selectedFeedId,
  onSelectFeed,
  onAddFeed,
  onRefreshFeed,
  onDeleteFeed,
  onRefreshAllFeeds,
}: AppSidebarProps) {
  const totalUnread = feeds.reduce((sum, feed) => sum + feed._count.articles, 0);

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

        {/* Subscriptions */}
        <div>
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Subscriptions
          </div>
          <div className="space-y-0.5">
            {feeds.map((feed) => (
              <div key={feed.id} className="group relative">
                <button
                  onClick={() => onSelectFeed(feed.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm pr-8",
                    selectedFeedId === feed.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                >
                  {feed.imageUrl ? (
                    <img
                      src={feed.imageUrl}
                      alt=""
                      className="size-4 rounded shrink-0"
                    />
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
                    <DropdownMenuItem onClick={() => onRefreshFeed(feed.id)}>
                      <RefreshCwIcon className="mr-2 size-4" />
                      Refresh
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDeleteFeed(feed.id)}
                      className="text-red-600"
                    >
                      <Trash2Icon className="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-2">
        <SettingsDialog
          feeds={feeds}
          onRefreshFeed={onRefreshFeed}
          onDeleteFeed={onDeleteFeed}
          onRefreshAllFeeds={onRefreshAllFeeds}
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

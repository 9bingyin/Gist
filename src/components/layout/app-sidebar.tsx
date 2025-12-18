"use client";

import { RssIcon, RefreshCwIcon, Trash2Icon, MoreHorizontalIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddFeedDialog } from "@/components/add-feed-dialog";
import type { Feed } from "@/lib/types";

interface AppSidebarProps {
  feeds: Feed[];
  selectedFeedId: string | null;
  onSelectFeed: (feedId: string | null) => void;
  onAddFeed: (url: string) => Promise<void>;
  onRefreshFeed: (feedId: string) => Promise<void>;
  onDeleteFeed: (feedId: string) => Promise<void>;
}

export function AppSidebar({
  feeds,
  selectedFeedId,
  onSelectFeed,
  onAddFeed,
  onRefreshFeed,
  onDeleteFeed,
}: AppSidebarProps) {
  const totalUnread = feeds.reduce((sum, feed) => sum + feed._count.articles, 0);

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="flex items-center gap-2">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                  <RssIcon className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">RSS Reader</span>
                  <span className="text-xs text-muted-foreground">
                    {feeds.length} feeds
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
            <AddFeedDialog onAdd={onAddFeed} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>All Articles</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selectedFeedId === null}
                  onClick={() => onSelectFeed(null)}
                >
                  <RssIcon className="size-4" />
                  <span>All Feeds</span>
                  {totalUnread > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {totalUnread}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Subscriptions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {feeds.map((feed) => (
                <SidebarMenuItem key={feed.id}>
                  <SidebarMenuButton
                    isActive={selectedFeedId === feed.id}
                    onClick={() => onSelectFeed(feed.id)}
                    className="group-has-[[data-state=open]]/menu-item:bg-sidebar-accent"
                  >
                    {feed.imageUrl ? (
                      <img
                        src={feed.imageUrl}
                        alt=""
                        className="size-4 rounded"
                      />
                    ) : (
                      <RssIcon className="size-4" />
                    )}
                    <span className="truncate">{feed.title}</span>
                    {feed._count.articles > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {feed._count.articles}
                      </span>
                    )}
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction>
                        <MoreHorizontalIcon className="size-4" />
                      </SidebarMenuAction>
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

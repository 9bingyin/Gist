"use client";

import { useState } from "react";
import {
  SettingsIcon,
  RssIcon,
  Trash2Icon,
  ExternalLinkIcon,
  RefreshCwIcon,
  GlobeIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import type { Feed } from "@/lib/types";

type SettingsTab = "feeds" | "general" | "about";

interface SettingsDialogProps {
  feeds: Feed[];
  onRefreshFeed: (feedId: string) => Promise<void>;
  onDeleteFeed: (feedId: string) => Promise<void>;
  onRefreshAllFeeds: () => Promise<void>;
  children?: React.ReactNode;
}

const menuItems: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "feeds", label: "Subscriptions", icon: <RssIcon className="size-4" /> },
  { id: "general", label: "General", icon: <SettingsIcon className="size-4" /> },
  { id: "about", label: "About", icon: <GlobeIcon className="size-4" /> },
];

export function SettingsDialog({
  feeds,
  onRefreshFeed,
  onDeleteFeed,
  onRefreshAllFeeds,
  children,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("feeds");
  const [refreshingFeedId, setRefreshingFeedId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

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

  const totalArticles = feeds.reduce((sum, feed) => sum + feed._count.articles, 0);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="icon">
            <SettingsIcon className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl h-[600px] p-0 gap-0">
        <div className="flex h-full">
          {/* Left menu */}
          <div className="w-[200px] border-r bg-muted/30 p-4">
            <DialogHeader className="pb-4">
              <DialogTitle className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                  <RssIcon className="size-4" />
                </div>
                <span>Settings</span>
              </DialogTitle>
            </DialogHeader>
            <nav className="space-y-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    activeTab === item.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "feeds" && (
              <FeedsSettings
                feeds={feeds}
                totalArticles={totalArticles}
                refreshingFeedId={refreshingFeedId}
                refreshingAll={refreshingAll}
                onRefreshFeed={handleRefreshFeed}
                onDeleteFeed={onDeleteFeed}
                onRefreshAll={handleRefreshAll}
              />
            )}
            {activeTab === "general" && <GeneralSettings />}
            {activeTab === "about" && <AboutSettings />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FeedsSettingsProps {
  feeds: Feed[];
  totalArticles: number;
  refreshingFeedId: string | null;
  refreshingAll: boolean;
  onRefreshFeed: (feedId: string) => Promise<void>;
  onDeleteFeed: (feedId: string) => Promise<void>;
  onRefreshAll: () => Promise<void>;
}

function FeedsSettings({
  feeds,
  totalArticles,
  refreshingFeedId,
  refreshingAll,
  onRefreshFeed,
  onDeleteFeed,
  onRefreshAll,
}: FeedsSettingsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Subscriptions</h3>
        <p className="text-sm text-muted-foreground">
          Manage your RSS feed subscriptions
        </p>
      </div>

      <Separator />

      {/* Stats */}
      <div className="flex gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-2xl font-bold">{feeds.length}</div>
          <div className="text-sm text-muted-foreground">Total Feeds</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-2xl font-bold">{totalArticles}</div>
          <div className="text-sm text-muted-foreground">Unread Articles</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Feed List</h4>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshAll}
          disabled={refreshingAll || feeds.length === 0}
        >
          <RefreshCwIcon className={`mr-2 size-4 ${refreshingAll ? "animate-spin" : ""}`} />
          Refresh All
        </Button>
      </div>

      {/* Feeds table */}
      {feeds.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed">
          <div className="text-center text-muted-foreground">
            <RssIcon className="mx-auto mb-2 size-8 opacity-50" />
            <p>No feeds yet</p>
            <p className="text-sm">Add a feed to get started</p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feed</TableHead>
                <TableHead className="w-[80px] text-center">Unread</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeds.map((feed) => (
                <TableRow key={feed.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {feed.imageUrl ? (
                        <img
                          src={feed.imageUrl}
                          alt=""
                          className="size-8 shrink-0 rounded"
                        />
                      ) : (
                        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-orange-500 text-xs font-bold text-white">
                          {feed.title.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium">{feed.title}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate max-w-[280px]">{feed.url}</span>
                          {feed.siteUrl && (
                            <a
                              href={feed.siteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 hover:text-foreground"
                            >
                              <ExternalLinkIcon className="size-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {feed._count.articles > 0 ? (
                      <Badge variant="secondary">{feed._count.articles}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onRefreshFeed(feed.id)}
                          disabled={refreshingFeedId === feed.id}
                        >
                          <RefreshCwIcon className={`mr-2 size-4 ${refreshingFeedId === feed.id ? "animate-spin" : ""}`} />
                          Refresh
                        </DropdownMenuItem>
                        {feed.siteUrl && (
                          <DropdownMenuItem asChild>
                            <a
                              href={feed.siteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLinkIcon className="mr-2 size-4" />
                              Visit Site
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => onDeleteFeed(feed.id)}
                          className="text-red-600"
                        >
                          <Trash2Icon className="mr-2 size-4" />
                          Delete
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
  );
}

function GeneralSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">General</h3>
        <p className="text-sm text-muted-foreground">
          Application settings and preferences
        </p>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="rounded-lg border p-4">
          <h4 className="font-medium">Language</h4>
          <p className="text-sm text-muted-foreground">
            Display language for the application
          </p>
          <div className="mt-2">
            <Badge variant="outline">English</Badge>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="font-medium">Theme</h4>
          <p className="text-sm text-muted-foreground">
            Appearance theme for the application
          </p>
          <div className="mt-2">
            <Badge variant="outline">System</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">About</h3>
        <p className="text-sm text-muted-foreground">
          Application information
        </p>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-xl bg-orange-500 text-white">
            <RssIcon className="size-8" />
          </div>
          <div>
            <h4 className="text-xl font-bold">RSS Reader</h4>
            <p className="text-sm text-muted-foreground">Version 1.0.0</p>
          </div>
        </div>

        <Separator />

        <div className="rounded-lg border p-4">
          <h4 className="font-medium">Description</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            A simple and elegant RSS reader built with Next.js, featuring a
            clean three-column layout for managing and reading your favorite
            RSS feeds.
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="font-medium">Tech Stack</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">Next.js</Badge>
            <Badge variant="secondary">React</Badge>
            <Badge variant="secondary">TypeScript</Badge>
            <Badge variant="secondary">Tailwind CSS</Badge>
            <Badge variant="secondary">Prisma</Badge>
            <Badge variant="secondary">SQLite</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

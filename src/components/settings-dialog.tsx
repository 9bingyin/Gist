"use client";

import { useState, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
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
import type { Feed, Folder } from "@/lib/types";

type SettingsTab = "feeds" | "folders" | "general" | "data" | "about";

interface SettingsDialogProps {
  feeds: Feed[];
  folders: Folder[];
  onRefreshFeed: (feedId: string) => Promise<void>;
  onDeleteFeed: (feedId: string) => Promise<void>;
  onRefreshAllFeeds: () => Promise<void>;
  onAddFolder: (name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onMoveFeedToFolder: (feedId: string, folderId: string | null) => Promise<void>;
  onDataChange?: () => Promise<void>;
  children?: React.ReactNode;
}

const menuItems: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "feeds", label: "Subscriptions", icon: <RssIcon className="size-4" /> },
  { id: "folders", label: "Folders", icon: <FolderIcon className="size-4" /> },
  { id: "general", label: "General", icon: <SettingsIcon className="size-4" /> },
  { id: "data", label: "Data", icon: <DatabaseIcon className="size-4" /> },
  { id: "about", label: "About", icon: <GlobeIcon className="size-4" /> },
];

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
  onDataChange,
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
      <DialogContent className="sm:max-w-4xl h-[600px] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <div className="flex h-full overflow-hidden">
          {/* Left menu */}
          <div className="w-[200px] border-r bg-muted/30 p-4 flex flex-col">
            <DialogHeader className="pb-4 shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                  <RssIcon className="size-4" />
                </div>
                <span>Settings</span>
              </DialogTitle>
            </DialogHeader>
            <nav className="space-y-1 overflow-y-auto flex-1">
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
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
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
              />
            )}
            {activeTab === "folders" && (
              <FoldersSettings
                folders={folders}
                feeds={feeds}
                onAddFolder={onAddFolder}
                onDeleteFolder={onDeleteFolder}
                onRenameFolder={onRenameFolder}
              />
            )}
            {activeTab === "general" && <GeneralSettings />}
            {activeTab === "data" && <DataSettings onDataChange={onDataChange} />}
            {activeTab === "about" && <AboutSettings />}
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
  onMoveFeedToFolder: (feedId: string, folderId: string | null) => Promise<void>;
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
}: FeedsSettingsProps) {
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
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} feeds?`)) return;
    
    setIsBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => onDeleteFeed(id)));
      setSelectedIds(new Set());
    } finally {
      setIsBulkDeleting(false);
    }
  };

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
        <div className="rounded-lg border bg-card p-4 flex-1">
          <div className="text-2xl font-bold">{feeds.length}</div>
          <div className="text-sm text-muted-foreground">Total Feeds</div>
        </div>
        <div className="rounded-lg border bg-card p-4 flex-1">
          <div className="text-2xl font-bold">{totalArticles}</div>
          <div className="text-sm text-muted-foreground">Unread Articles</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h4 className="font-medium">Feed List</h4>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
              <span className="text-xs text-muted-foreground mr-2">
                {selectedIds.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleBulkRefresh}
                disabled={isBulkRefreshing || isBulkDeleting}
              >
                <RefreshCwIcon className={`mr-1 size-3 ${isBulkRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-red-600 hover:text-red-600 hover:bg-red-50"
                onClick={handleBulkDelete}
                disabled={isBulkRefreshing || isBulkDeleting}
              >
                <Trash2Icon className="mr-1 size-3" />
                Delete
              </Button>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshAll}
          disabled={refreshingAll || feeds.length === 0 || isBulkRefreshing || isBulkDeleting}
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
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedIds.size === feeds.length && feeds.length > 0}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Feed</TableHead>
                <TableHead>Folder</TableHead>
                <TableHead className="w-[80px] text-center">Unread</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeds.map((feed) => (
                <TableRow key={feed.id} className={selectedIds.has(feed.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(feed.id)}
                      onCheckedChange={() => toggleSelect(feed.id)}
                      aria-label={`Select ${feed.title}`}
                    />
                  </TableCell>
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
                        <div className="font-medium truncate max-w-[200px]">{feed.title}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate max-w-[200px]">{feed.url}</span>
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
                  <TableCell>
                    <Select
                      value={feed.folderId || "none"}
                      onValueChange={(val) => onMoveFeedToFolder(feed.id, val === "none" ? null : val)}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue placeholder="No Folder" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Folder</SelectItem>
                        {folders.map((folder) => (
                          <SelectItem key={folder.id} value={folder.id}>
                            {folder.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

interface FoldersSettingsProps {
  folders: Folder[];
  feeds: Feed[];
  onAddFolder: (name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
}

function FoldersSettings({
  folders,
  feeds,
  onAddFolder,
  onDeleteFolder,
  onRenameFolder,
}: FoldersSettingsProps) {
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
      await onAddFolder(newFolderName.trim());
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
    if (!confirm("Are you sure you want to delete this folder? Feeds in this folder will be moved to 'No Folder'.")) return;
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
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} folders? Feeds in these folders will be moved to 'No Folder'.`)) return;

    setIsBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => onDeleteFolder(id)));
      setSelectedIds(new Set());
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Folders</h3>
        <p className="text-sm text-muted-foreground">
          Organize your feeds into folders
        </p>
      </div>

      <Separator />

      {/* Actions & Add Folder */}
      <div className="flex items-center justify-between gap-4">
        <form onSubmit={handleAddFolder} className="flex flex-1 gap-2">
          <Input
            placeholder="New folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="max-w-[300px]"
          />
          <Button type="submit" disabled={isSubmitting || !newFolderName.trim() || isBulkDeleting}>
            <PlusIcon className="mr-2 size-4" />
            Add Folder
          </Button>
        </form>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
            <span className="text-xs text-muted-foreground mr-2">
              {selectedIds.size} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs text-red-600 hover:text-red-600 hover:bg-red-50"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || isSubmitting}
            >
              <Trash2Icon className="mr-1 size-3" />
              Delete Selected
            </Button>
          </div>
        )}
      </div>

      {/* Folders List */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={selectedIds.size === folders.length && folders.length > 0}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all folders"
                />
              </TableHead>
              <TableHead>Folder Name</TableHead>
              <TableHead className="w-[100px] text-center">Feeds</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {folders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No folders created yet.
                </TableCell>
              </TableRow>
            ) : (
              folders.map((folder) => (
                <TableRow key={folder.id} className={selectedIds.has(folder.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(folder.id)}
                      onCheckedChange={() => toggleSelect(folder.id)}
                      aria-label={`Select ${folder.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    {editingId === folder.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8 max-w-[200px]"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <Button size="sm" className="h-8" onClick={handleSaveEdit} disabled={isSubmitting}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <FolderIcon className="size-4 text-muted-foreground" />
                        <span className="font-medium">{folder.name}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">
                      {feeds.filter(f => f.folderId === folder.id).length}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => handleStartEdit(folder)}
                        disabled={isBulkDeleting}
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-red-600 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteFolder(folder.id)}
                        disabled={isBulkDeleting}
                      >
                        <Trash2Icon className="size-4" />
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
  );
}

function GeneralSettings() {
  const { theme, setTheme } = useTheme();

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
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Theme</h4>
              <p className="text-sm text-muted-foreground">
                Select the appearance theme
              </p>
            </div>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <div className="flex items-center gap-2">
                    <SunIcon className="size-4" />
                    Light
                  </div>
                </SelectItem>
                <SelectItem value="dark">
                  <div className="flex items-center gap-2">
                    <MoonIcon className="size-4" />
                    Dark
                  </div>
                </SelectItem>
                <SelectItem value="system">
                  <div className="flex items-center gap-2">
                    <MonitorIcon className="size-4" />
                    System
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="font-medium">Language</h4>
          <p className="text-sm text-muted-foreground">
            Display language for the application
          </p>
          <div className="mt-2">
            <Badge variant="outline">English</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DataSettingsProps {
  onDataChange?: () => Promise<void>;
}

function DataSettings({ onDataChange }: DataSettingsProps) {
  const [importing, setImporting] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportOpml = () => {
    window.open("/api/opml", "_blank");
  };

  const handleImportOpml = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage(null);

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

      // Task created successfully, progress will be shown in TaskProgress component
      setMessage({
        type: "success",
        text: "Import started. Check progress in the bottom right corner.",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to import OPML",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, []);

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
        text: `Marked ${data.count} articles as read`,
      });
      onDataChange?.();
    } catch {
      setMessage({
        type: "error",
        text: "Failed to mark articles as read",
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
        text: `Deleted ${data.count} read articles`,
      });
      onDataChange?.();
    } catch {
      setMessage({
        type: "error",
        text: "Failed to clean up articles",
      });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Data Management</h3>
        <p className="text-sm text-muted-foreground">
          Import, export, and manage your data
        </p>
      </div>

      <Separator />

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-500/10 text-green-600"
              : "bg-red-500/10 text-red-600"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        {/* Import/Export OPML */}
        <div className="rounded-lg border p-4">
          <h4 className="font-medium">OPML</h4>
          <p className="text-sm text-muted-foreground">
            Import or export your subscriptions in OPML format
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportOpml}>
              <DownloadIcon className="mr-2 size-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <UploadIcon className="mr-2 size-4" />
              {importing ? "Importing..." : "Import"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              onChange={handleImportOpml}
              className="hidden"
            />
          </div>
        </div>

        {/* Mark All Read */}
        <div className="rounded-lg border p-4">
          <h4 className="font-medium">Mark All as Read</h4>
          <p className="text-sm text-muted-foreground">
            Mark all articles across all feeds as read
          </p>
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAllRead}
            >
              <CheckCircleIcon className="mr-2 size-4" />
              {markingAllRead ? "Processing..." : "Mark All Read"}
            </Button>
          </div>
        </div>

        {/* Cleanup */}
        <div className="rounded-lg border p-4">
          <h4 className="font-medium">Clean Up</h4>
          <p className="text-sm text-muted-foreground">
            Delete old read articles to save space
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCleanup(7)}
              disabled={cleaning}
            >
              <Trash2Icon className="mr-2 size-4" />
              Older than 7 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCleanup(30)}
              disabled={cleaning}
            >
              <Trash2Icon className="mr-2 size-4" />
              Older than 30 days
            </Button>
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

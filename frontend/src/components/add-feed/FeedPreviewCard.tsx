import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Image,
  Loader2,
  Plus,
  Rss,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/date-utils";
import { isSafeUrl, getSafeHostname } from "@/lib/url";
import { getProxiedImageUrl } from "@/lib/image-proxy";
import type { FeedPreview, Folder, ContentType } from "@/types/api";
import type { SubscribeOptions } from "@/hooks/useAddFeed";

interface FeedPreviewCardProps {
  feed: FeedPreview;
  folders: Folder[];
  contentType: ContentType;
  onSubscribe: (url: string, options: SubscribeOptions) => void;
  isLoading?: boolean;
}

const getTypeIcon = (type: ContentType) => {
  switch (type) {
    case "article":
      return <FileText className="size-3 text-muted-foreground" />;
    case "picture":
      return <Image className="size-3 text-muted-foreground" />;
    case "notification":
      return <Bell className="size-3 text-muted-foreground" />;
  }
};

export function FeedPreviewCard({
  feed,
  folders,
  contentType,
  onSubscribe,
  isLoading = false,
}: FeedPreviewCardProps) {
  const { t } = useTranslation();
  const [customTitle, setCustomTitle] = useState("");
  const [folderInput, setFolderInput] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredFolders = useMemo(() => {
    if (!folderInput.trim()) {
      return folders;
    }
    const lowerInput = folderInput.toLowerCase();
    return folders.filter((folder) =>
      folder.name.toLowerCase().includes(lowerInput),
    );
  }, [folders, folderInput]);

  const selectedFolder = useMemo(() => {
    if (!folderInput.trim()) return null;
    return folders.find(
      (folder) =>
        folder.name.toLowerCase() === folderInput.trim().toLowerCase(),
    );
  }, [folders, folderInput]);

  const isNewFolder = useMemo(() => {
    if (!folderInput.trim()) return false;
    return !selectedFolder;
  }, [folderInput, selectedFolder]);

  const handleSubscribe = useCallback(() => {
    const targetFolderType = selectedFolder
      ? selectedFolder.type
      : folderInput.trim()
        ? contentType
        : undefined;
    onSubscribe(feed.url, {
      title: customTitle || undefined,
      folderName: folderInput.trim() || undefined,
      targetFolderType,
    });
  }, [
    feed.url,
    customTitle,
    folderInput,
    selectedFolder,
    contentType,
    onSubscribe,
  ]);

  const handleFolderSelect = useCallback((folderName: string) => {
    setFolderInput(folderName);
    setShowFolderDropdown(false);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        folderInputRef.current &&
        !folderInputRef.current.contains(event.target as Node)
      ) {
        setShowFolderDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayTitle = customTitle || feed.title;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {/* Feed Header */}
      <div className="flex items-start gap-4 p-4">
        {/* Feed Icon */}
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-accent">
          {feed.imageUrl && isSafeUrl(feed.imageUrl) ? (
            <img
              src={getProxiedImageUrl(feed.imageUrl, feed.siteUrl)}
              alt=""
              className="size-12 rounded-lg object-cover"
            />
          ) : (
            <Rss className="size-6 text-muted-foreground" strokeWidth={1.5} />
          )}
        </div>

        {/* Feed Info */}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">{displayTitle}</h3>
          {feed.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {feed.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {feed.siteUrl && isSafeUrl(feed.siteUrl) && (
              <a
                href={feed.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary transition-colors"
              >
                <ExternalLink className="size-3" />
                <span className="truncate max-w-[180px]">
                  {getSafeHostname(feed.siteUrl)}
                </span>
              </a>
            )}
            {feed.itemCount !== undefined && (
              <span className="inline-flex items-center gap-1">
                <FileText className="size-3" />
                {feed.itemCount} {t("add_feed.items")}
              </span>
            )}
            {feed.lastUpdated && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {formatRelativeTime(feed.lastUpdated, t)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Options Section */}
      {showOptions && (
        <div className="border-t border-border bg-accent/30 px-4 py-4 space-y-4">
          {/* Custom Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t("add_feed.custom_title")}
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={feed.title}
              className={cn(
                "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm",
                "placeholder:text-muted-foreground/60",
                "focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20",
              )}
            />
          </div>

          {/* Folder */}
          <div className="relative">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t("add_feed.folder")}
            </label>
            <input
              ref={folderInputRef}
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              onFocus={() => setShowFolderDropdown(true)}
              placeholder={t("add_feed.select_or_create_folder")}
              className={cn(
                "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm",
                "placeholder:text-muted-foreground/60",
                "focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20",
              )}
            />
            {showFolderDropdown &&
              (filteredFolders.length > 0 || isNewFolder) && (
                <div
                  ref={dropdownRef}
                  className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-background shadow-lg max-h-48 overflow-auto"
                >
                  {isNewFolder && (
                    <button
                      type="button"
                      onClick={() => handleFolderSelect(folderInput.trim())}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-accent",
                        "flex items-center gap-2 text-primary",
                      )}
                    >
                      <Plus className="size-4" />
                      {t("add_feed.create_folder", {
                        name: folderInput.trim(),
                      })}
                    </button>
                  )}
                  {filteredFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => handleFolderSelect(folder.name)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                    >
                      {getTypeIcon(folder.type)}
                      <span>{folder.name}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm",
            "text-muted-foreground hover:text-foreground",
            "transition-colors duration-200",
          )}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              showOptions && "rotate-180",
            )}
          />
          {showOptions
            ? t("add_feed.hide_options")
            : t("add_feed.more_options")}
        </button>

        <button
          type="button"
          onClick={handleSubscribe}
          disabled={isLoading}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2",
            "bg-primary text-primary-foreground text-sm font-medium",
            "transition-all duration-200",
            "hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>{t("add_feed.subscribing")}</span>
            </>
          ) : (
            <>
              <Plus className="size-4" />
              <span>{t("add_feed.subscribe")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

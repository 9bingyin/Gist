import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Rss } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAddFeed, type SubscribeOptions } from "@/hooks/useAddFeed";
import { useFolders } from "@/hooks/useFolders";
import { BackIcon } from "@/components/ui/icons";
import { FeedUrlForm } from "./FeedUrlForm";
import { FeedPreviewCard } from "./FeedPreviewCard";
import type { ContentType } from "@/types/api";

interface AddFeedPageProps {
  onClose: () => void;
  onFeedAdded?: (feedUrl: string) => void;
  contentType?: ContentType;
}

export type { FeedPreview } from "@/types/api";
export type { SubscribeOptions } from "@/hooks/useAddFeed";

export function AddFeedPage({
  onClose,
  onFeedAdded,
  contentType = "article",
}: AddFeedPageProps) {
  const { t } = useTranslation();
  const { feedPreview, isLoading, error, discoverFeed, subscribeFeed } =
    useAddFeed(contentType);
  const { data: folders = [] } = useFolders();

  const handleSubscribe = useCallback(
    async (feedUrl: string, options: SubscribeOptions) => {
      const success = await subscribeFeed(feedUrl, options);
      if (success) {
        onFeedAdded?.(feedUrl);
        onClose();
      }
    },
    [subscribeFeed, onFeedAdded, onClose],
  );

  return (
    <div className="relative flex h-full flex-col bg-background">
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "absolute left-4 top-4 z-10",
          "inline-flex items-center gap-1.5",
          "rounded-lg px-3 py-1.5",
          "text-sm text-muted-foreground",
          "hover:bg-accent/50 hover:text-foreground",
          "transition-colors duration-200",
        )}
      >
        <BackIcon className="size-4" />
        <span>{t("add_feed.back")}</span>
      </button>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <Rss className="size-8 text-primary" strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-semibold">
              {t("add_feed.add_rss_feed")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("add_feed.feed_description")}
            </p>
          </div>

          <FeedUrlForm onSubmit={discoverFeed} isLoading={isLoading} />

          {error && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {feedPreview && (
            <div className="mt-6">
              <FeedPreviewCard
                key={feedPreview.url}
                feed={feedPreview}
                folders={folders}
                contentType={contentType}
                onSubscribe={handleSubscribe}
                isLoading={isLoading}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

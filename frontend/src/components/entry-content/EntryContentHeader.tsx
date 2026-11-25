import { useTranslation } from "react-i18next";
import {
  ExternalLink,
  FileText,
  Languages,
  Lightbulb,
  RefreshCw,
  Star,
} from "lucide-react";
import { isSafeUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import { BackIcon } from "@/components/ui/icons";
import { dispatchScrollToTop } from "@/hooks/useScrollToTop";
import type { Entry } from "@/types/api";

interface EntryContentHeaderProps {
  entry: Entry;
  displayTitle?: string | null;
  isAtTop: boolean;
  isReadableActive: boolean;
  isLoading: boolean;
  error: string | null;
  onToggleReadable: () => void;
  onToggleStarred: () => void;
  isLoadingSummary?: boolean;
  hasSummary?: boolean;
  onToggleSummary?: () => void;
  isTranslating?: boolean;
  hasTranslation?: boolean;
  translationDisabled?: boolean;
  onToggleTranslation?: () => void;
  isMobile?: boolean;
  onBack?: () => void;
}

interface TranslationButtonState {
  isDisabled: boolean;
  isTranslating: boolean;
  hasTranslation: boolean;
}

function getTranslationButtonTitle(
  state: TranslationButtonState,
  t: (key: string) => string,
): string {
  if (state.isDisabled && !state.hasTranslation && !state.isTranslating) {
    return t("entry.already_target_language");
  }
  if (state.isTranslating) {
    return t("entry.cancel_translation");
  }
  if (state.hasTranslation) {
    return t("entry.show_original");
  }
  return t("entry.translate_article");
}

function getTranslationButtonClassName(state: TranslationButtonState): string {
  if (state.isDisabled && !state.hasTranslation && !state.isTranslating) {
    return "text-muted-foreground/50 cursor-not-allowed";
  }
  if (state.hasTranslation && !state.isTranslating) {
    return "bg-muted text-foreground";
  }
  return "text-muted-foreground hover:bg-accent hover:text-foreground";
}

export function EntryContentHeader({
  entry,
  displayTitle,
  isAtTop,
  isReadableActive,
  isLoading,
  error,
  onToggleReadable,
  onToggleStarred,
  isLoadingSummary,
  hasSummary,
  onToggleSummary,
  isTranslating,
  hasTranslation,
  translationDisabled,
  onToggleTranslation,
  isMobile,
  onBack,
}: EntryContentHeaderProps) {
  const { t } = useTranslation();
  const safeUrl = entry.url && isSafeUrl(entry.url) ? entry.url : null;
  const title = displayTitle ?? entry.title ?? t("entry.untitled");

  const starLabel = entry.starred
    ? t("entry.remove_from_starred")
    : t("entry.add_to_starred");
  const summaryLabel = isLoadingSummary
    ? t("entry.cancel_summary")
    : hasSummary
      ? t("entry.hide_summary")
      : t("entry.generate_summary");
  const translationState: TranslationButtonState = {
    isDisabled: !!translationDisabled,
    isTranslating: !!isTranslating,
    hasTranslation: !!hasTranslation,
  };
  const translationLabel = getTranslationButtonTitle(translationState, t);
  const readableLabel =
    error ||
    (isReadableActive ? t("entry.show_original") : t("entry.show_readable"));

  return (
    <div className="absolute inset-x-0 top-0 z-20">
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300 ease-in-out pointer-events-none border-b border-border bg-background/95 backdrop-blur",
          isAtTop ? "opacity-0" : "opacity-100",
        )}
      />

      <div className="relative flex h-12 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {isMobile && onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t("add_feed.back")}
              className="no-drag-region flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-item-hover -ml-1.5"
            >
              <BackIcon className="size-5" />
            </button>
          )}
          <div
            className={cn(
              "truncate text-lg font-bold text-foreground transition-all duration-300 ease-in-out",
              isAtTop
                ? "translate-y-4 opacity-0 pointer-events-none"
                : "translate-y-0 opacity-100 cursor-pointer active:opacity-70",
            )}
            onClick={
              isAtTop ? undefined : () => dispatchScrollToTop("entrycontent")
            }
          >
            {title}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleStarred}
            title={starLabel}
            aria-label={starLabel}
            className={cn(
              "no-drag-region flex size-9 items-center justify-center rounded-lg transition-colors",
              entry.starred
                ? "text-amber-500 hover:bg-amber-500/10"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Star
              className="size-5"
              fill={entry.starred ? "currentColor" : "none"}
            />
          </button>

          {onToggleSummary && (
            <button
              type="button"
              onClick={onToggleSummary}
              title={summaryLabel}
              aria-label={summaryLabel}
              className={cn(
                "no-drag-region flex size-9 items-center justify-center rounded-lg transition-colors",
                hasSummary
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span
                className={cn(isLoadingSummary && "ai-icon-thinking-wrapper")}
              >
                <Lightbulb className="size-5" />
              </span>
            </button>
          )}

          {onToggleTranslation && (
            <button
              type="button"
              onClick={onToggleTranslation}
              disabled={
                translationDisabled && !hasTranslation && !isTranslating
              }
              title={translationLabel}
              aria-label={translationLabel}
              className={cn(
                "no-drag-region flex size-9 items-center justify-center rounded-lg transition-colors",
                getTranslationButtonClassName(translationState),
              )}
            >
              <span className={cn(isTranslating && "ai-icon-thinking-wrapper")}>
                <Languages className="size-5" />
              </span>
            </button>
          )}

          {entry.url && (
            <button
              type="button"
              onClick={onToggleReadable}
              disabled={isLoading}
              title={readableLabel}
              aria-label={readableLabel}
              className={cn(
                "no-drag-region flex size-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                error
                  ? "text-destructive hover:bg-destructive/10"
                  : isReadableActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {isLoading ? (
                <RefreshCw className="size-5 animate-spin" />
              ) : (
                <FileText className="size-5" />
              )}
            </button>
          )}

          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="no-drag-region flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("entry.open_original")}
            >
              <ExternalLink className="size-5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

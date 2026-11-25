import { useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  useEntry,
  useMarkAsRead,
  useMarkAsStarred,
  useRemoveFromUnreadList,
} from "@/hooks/useEntries";
import { useAISettings } from "@/hooks/useAISettings";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useEntryContentScroll } from "@/hooks/useEntryContentScroll";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { useReadability } from "@/hooks/useReadability";
import { useAISummary } from "@/hooks/useAISummary";
import { useAITranslation } from "@/hooks/useAITranslation";
import { EntryContentHeader } from "./EntryContentHeader";
import { EntryContentBody } from "./EntryContentBody";
import {
  EntryContentEmpty,
  EntryContentSkeleton,
} from "./EntryContentPlaceholders";

interface EntryContentProps {
  entryId: string | null;
  isMobile?: boolean;
  onBack?: () => void;
}

export function EntryContent({ entryId, isMobile, onBack }: EntryContentProps) {
  const { t } = useTranslation();
  const { data: entry, isLoading } = useEntry(entryId);
  const { data: aiSettings } = useAISettings();
  const { data: generalSettings } = useGeneralSettings();
  const { mutate: markAsRead } = useMarkAsRead();
  const { mutate: markAsStarred } = useMarkAsStarred();
  const removeFromUnreadList = useRemoveFromUnreadList();
  const { scrollRef, isAtTop, scrollNode } = useEntryContentScroll(entryId);

  useScrollToTop(scrollNode, "entrycontent");

  const markedAsReadRef = useRef<Set<string>>(new Set());

  const autoTranslate = aiSettings?.autoTranslate ?? false;
  const targetLanguage = aiSettings?.summaryLanguage ?? "zh-CN";
  const autoReadability = generalSettings?.autoReadability ?? false;
  const autoSummary = aiSettings?.autoSummary ?? false;

  const {
    isReadableLoading,
    readableContent,
    readableError,
    isReadableActive,
    baseContent,
    handleToggleReadable,
  } = useReadability({ entry, autoReadability });

  const { aiSummary, isLoadingSummary, summaryError, handleToggleSummary } =
    useAISummary({
      entry,
      isReadableActive,
      readableContent,
      autoSummary,
    });

  const {
    isTranslating,
    hasTranslation,
    translationDisabled,
    displayTitle,
    translatedContentBlocks,
    combinedTranslatedContent,
    handleToggleTranslation,
  } = useAITranslation({
    entry,
    isReadableActive,
    readableContent,
    autoTranslate,
    targetLanguage,
  });

  useEffect(() => {
    if (entry && !entry.read) {
      markedAsReadRef.current.add(entry.id);
      markAsRead({ id: entry.id, read: true, skipInvalidate: true });
    }
  }, [entry, markAsRead]);

  useEffect(() => {
    const markedAsReadSet = markedAsReadRef.current;
    return () => {
      if (markedAsReadSet.size > 0) {
        removeFromUnreadList(markedAsReadSet);
        markedAsReadSet.clear();
      }
    };
  }, [removeFromUnreadList]);

  const handleToggleStarred = useCallback(() => {
    if (entry) {
      markAsStarred({ id: entry.id, starred: !entry.starred });
    }
  }, [entry, markAsStarred]);

  const displayContent = combinedTranslatedContent ?? baseContent;
  const highlightContent = combinedTranslatedContent ?? baseContent ?? "";

  if (entryId === null) {
    return <EntryContentEmpty message={t("entry.select_article")} />;
  }

  if (isLoading) {
    return <EntryContentSkeleton />;
  }

  if (!entry) {
    return <EntryContentEmpty message={t("entry.select_article")} />;
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <EntryContentHeader
        entry={entry}
        displayTitle={displayTitle}
        isAtTop={isAtTop}
        isReadableActive={isReadableActive}
        isLoading={isReadableLoading}
        error={readableError}
        onToggleReadable={handleToggleReadable}
        onToggleStarred={handleToggleStarred}
        isLoadingSummary={isLoadingSummary}
        hasSummary={!!aiSummary}
        onToggleSummary={handleToggleSummary}
        isTranslating={isTranslating}
        hasTranslation={hasTranslation}
        translationDisabled={translationDisabled}
        onToggleTranslation={handleToggleTranslation}
        isMobile={isMobile}
        onBack={onBack}
      />
      <EntryContentBody
        entry={entry}
        displayTitle={displayTitle}
        scrollRef={scrollRef}
        scrollNode={scrollNode}
        displayContent={displayContent}
        displayBlocks={translatedContentBlocks}
        highlightContent={highlightContent}
        aiSummary={aiSummary}
        isLoadingSummary={isLoadingSummary}
        summaryError={summaryError}
      />
    </div>
  );
}

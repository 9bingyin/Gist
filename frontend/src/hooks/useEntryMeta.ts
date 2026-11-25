import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { stripHtml } from "@/lib/html-utils";
import type { Entry } from "@/types/api";

export function useEntryMeta(entry: Entry | null | undefined) {
  const { t, i18n } = useTranslation();
  const publishedAtRaw = entry?.publishedAt;
  const entryContent = entry?.content;

  const longDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [i18n.language],
  );

  const publishedAt = useMemo(() => {
    if (!publishedAtRaw) return null;
    const date = new Date(publishedAtRaw);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }, [publishedAtRaw]);

  const publishedLong = useMemo(() => {
    if (!publishedAt) return null;
    return longDateFormatter.format(publishedAt);
  }, [publishedAt, longDateFormatter]);

  const readingTime = useMemo(() => {
    if (!entryContent) return null;
    const text = stripHtml(entryContent);
    const words = text.match(/[\u4e00-\u9fa5]|\w+/g)?.length || 0;
    const mins = Math.ceil(words / 230);
    return mins > 0 ? t("entry.min_read", { mins }) : null;
  }, [entryContent, t]);

  return { publishedLong, readingTime };
}

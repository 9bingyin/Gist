import i18n from "@/i18n";

type SortDirection = "asc" | "desc";

function getActiveLocale(locale?: string): string | undefined {
  return locale || i18n.language || undefined;
}

/**
 * Format date as localized date string
 */
export function formatDate(dateString: string, locale?: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(getActiveLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Format date as localized date-time string
 */
export function formatDateTime(dateString: string, locale?: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(getActiveLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Compare strings with ASCII-first sorting (English before CJK)
 */
export function compareStrings(a: string, b: string, locale?: string): number {
  const isAscii = (str: string) => {
    if (str.length === 0) return false;
    const code = str.charCodeAt(0);
    return code >= 0x20 && code <= 0x7e;
  };
  const aIsAscii = isAscii(a);
  const bIsAscii = isAscii(b);
  if (aIsAscii && !bIsAscii) return -1;
  if (!aIsAscii && bIsAscii) return 1;
  const resolvedLocale = getActiveLocale(locale);
  const hasCjk = /[\u4e00-\u9fff]/.test(a) || /[\u4e00-\u9fff]/.test(b);
  const collationLocale =
    locale ??
    (hasCjk && (!resolvedLocale || !resolvedLocale.startsWith("zh"))
      ? "zh-CN"
      : (resolvedLocale ?? "zh-CN"));
  return a.localeCompare(b, collationLocale);
}

/**
 * Get checkbox class name based on selection state
 */
export function getCheckboxClassName(
  isAllSelected: boolean,
  isPartialSelected: boolean,
): string {
  if (isAllSelected) {
    return "border-primary bg-primary text-primary-foreground";
  }
  if (isPartialSelected) {
    return "border-primary bg-primary/50 text-primary-foreground";
  }
  return "border-border bg-background hover:border-primary/50";
}

/**
 * Get sort icon character
 */
export function getSortIcon<T extends string>(
  currentField: T,
  targetField: T,
  direction: SortDirection,
): string {
  if (currentField !== targetField) return "-";
  return direction === "asc" ? "\u2191" : "\u2193";
}

"use client";

import { useTranslation } from "react-i18next";
import { ClockIcon, BugIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ErrorTooltipProps {
  errorAt?: string | null;
  errorMessage?: string | null;
  children: React.ReactNode;
}

export function ErrorTooltip({
  errorAt,
  errorMessage,
  children,
}: ErrorTooltipProps) {
  const { t } = useTranslation();

  if (!errorAt || !errorMessage) {
    return null;
  }

  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return t("time.unknown");

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diff / (1000 * 60));
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return t("time.just_now");
    if (diffMinutes < 60) return t("time.minutes_ago", { count: diffMinutes });
    if (diffHours < 24) return t("time.hours_ago", { count: diffHours });
    return t("time.days_ago", { count: diffDays });
  };

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <ClockIcon className="size-3.5 shrink-0" />
            <span>
              {t("feed.error_since")} {formatRelativeTime(errorAt)}
            </span>
          </div>
          {errorMessage && (
            <div className="flex items-start gap-1.5">
              <BugIcon className="size-3.5 shrink-0 mt-0.5" />
              <span className="break-words">{errorMessage}</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

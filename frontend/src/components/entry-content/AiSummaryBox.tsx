import { useTranslation } from "react-i18next";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiSummaryBoxProps {
  content: string | null;
  isLoading?: boolean;
  error?: string | null;
}

export function AiSummaryBox({ content, isLoading, error }: AiSummaryBoxProps) {
  const { t } = useTranslation();

  if (!content && !isLoading && !error) return null;

  return (
    <div
      className={cn(
        "ai-summary-box rounded-lg border mb-1.5 break-words",
        error
          ? "border-destructive/30 bg-destructive/5"
          : "border-primary/20 bg-primary/5",
      )}
    >
      <div className="ai-summary-grid">
        <div className="ai-summary-content">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb
                className={cn(
                  "size-4",
                  error ? "text-destructive" : "text-primary",
                )}
              />
              <h3
                className={cn(
                  "text-sm font-semibold",
                  error ? "text-destructive" : "text-primary",
                )}
              >
                {t("entry.ai_summary")}
              </h3>
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <div className="text-sm leading-relaxed space-y-2">
                {content
                  ?.split("\n")
                  .filter((line) => line.trim())
                  .map((point, i) => (
                    <p key={i}>{point.trim()}</p>
                  ))}
                {isLoading && !content && (
                  <div className="space-y-2.5">
                    <div className="h-4 w-full rounded ai-shimmer" />
                    <div className="h-4 w-full rounded ai-shimmer" />
                    <div className="h-4 w-3/5 rounded ai-shimmer" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

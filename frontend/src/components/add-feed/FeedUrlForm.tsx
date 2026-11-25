import { useState, useCallback, useRef, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Rss, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeUrl } from "@/lib/url";

interface FeedUrlFormProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
}

export function FeedUrlForm({ onSubmit, isLoading = false }: FeedUrlFormProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isLoading) return;

      const url = normalizeUrl(inputValue);
      if (url) {
        onSubmit(url);
      }
    },
    [inputValue, isLoading, onSubmit],
  );

  const handleClear = useCallback(() => {
    setInputValue("");
    inputRef.current?.focus();
  }, []);

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-border",
          "bg-background px-4 py-2.5",
          "transition-colors duration-200",
          "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20",
        )}
      >
        <div className="shrink-0 text-muted-foreground">
          <Rss className="size-5" strokeWidth={1.5} />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="https://example.com/feed.xml"
          disabled={isLoading}
          className={cn(
            "flex-1 bg-transparent text-sm outline-none",
            "placeholder:text-muted-foreground/60",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {inputValue && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              "shrink-0 rounded-md p-1",
              "text-muted-foreground hover:text-foreground",
              "transition-colors duration-200",
            )}
            aria-label={t("add_feed.clear_input")}
          >
            <X className="size-4" />
          </button>
        )}

        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          className={cn(
            "shrink-0 rounded-lg px-4 py-1.5",
            "bg-primary text-primary-foreground text-sm font-medium",
            "transition-all duration-200",
            "hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>{t("add_feed.loading")}</span>
            </div>
          ) : (
            t("add_feed.add")
          )}
        </button>
      </div>
    </form>
  );
}

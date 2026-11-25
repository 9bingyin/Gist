import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface BackToTopButtonProps {
  scrollNode: HTMLDivElement;
  threshold?: number;
}

export function BackToTopButton({
  scrollNode,
  threshold = 300,
}: BackToTopButtonProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(scrollNode.scrollTop > threshold);
    };

    handleScroll();

    scrollNode.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollNode.removeEventListener("scroll", handleScroll);
  }, [scrollNode, threshold]);

  const handleClick = () => {
    scrollNode.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      tabIndex={isVisible ? 0 : -1}
      aria-hidden={!isVisible}
      aria-label={t("entry.back_to_top")}
      className={cn(
        "fixed bottom-6 right-6 z-30",
        "flex size-10 items-center justify-center rounded-full",
        "bg-background/80 backdrop-blur border border-border shadow-lg",
        "text-muted-foreground hover:text-foreground hover:bg-background",
        "transition-all duration-300",
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none",
      )}
    >
      <ChevronUp className="size-5" />
    </button>
  );
}

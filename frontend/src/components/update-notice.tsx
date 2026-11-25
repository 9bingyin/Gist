import { useEffect, useRef, useState } from "react";
import type { Workbox } from "workbox-window";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

export function UpdateNotice() {
  const { t } = useTranslation();
  const [needRefresh, setNeedRefresh] = useState(false);
  const workbox = useRef<Workbox | null>(null);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const onWaiting = () => setNeedRefresh(true);
    const onControlling = (event: { isUpdate?: boolean }) => {
      if (event.isUpdate) window.location.reload();
    };

    void import("workbox-window")
      .then(async ({ Workbox }) => {
        if (cancelled) return;
        const worker = new Workbox("/sw.js", { scope: "/" });
        workbox.current = worker;
        worker.addEventListener("waiting", onWaiting);
        worker.addEventListener("controlling", onControlling);
        const registration = await worker.register();
        if (!registration || cancelled) return;
        timer = window.setInterval(() => {
          if (navigator.onLine) void registration.update().catch(() => {});
        }, UPDATE_CHECK_INTERVAL);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          console.error("Service worker registration failed", error);
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      workbox.current?.removeEventListener("waiting", onWaiting);
      workbox.current?.removeEventListener("controlling", onControlling);
      workbox.current = null;
    };
  }, []);

  const handleClick = () => {
    workbox.current?.messageSkipWaiting();
  };

  if (!needRefresh) return null;

  return (
    <div
      className={cn(
        "fixed right-6 bottom-6 z-50 cursor-pointer",
        "mb-[env(safe-area-inset-bottom,0px)]",
      )}
      onClick={handleClick}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-2.5",
          "bg-background/95 backdrop-blur-sm",
          "border border-primary/20",
          "shadow-lg shadow-primary/10",
          "transition-all duration-200",
          "hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/15",
          "active:scale-[0.98]",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center">
          <Download className="size-5 text-primary" />
        </div>
        <div className="min-w-0 text-left">
          <div className="text-sm font-medium text-foreground">
            {t("update.available")}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("update.description")}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useInsertionEffect, useLayoutEffect, useRef } from "react";

const DOCUMENT_SCROLL_CLASS = "mobile-document-scroll";
const DOCUMENT_SCROLL_LOCKED_CLASS = "mobile-document-scroll-locked";

interface MobileDocumentScrollModeOptions {
  enabled: boolean;
  locked: boolean;
}

export function useMobileDocumentScrollMode({
  enabled,
  locked,
}: MobileDocumentScrollModeOptions): void {
  const lockedScrollY = useRef<number | null>(null);

  useInsertionEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousScrollRestoration = history.scrollRestoration;

    root.classList.toggle(DOCUMENT_SCROLL_CLASS, enabled);
    body.classList.toggle(DOCUMENT_SCROLL_CLASS, enabled);
    if (enabled) {
      history.scrollRestoration = "manual";
    }

    return () => {
      root.classList.remove(DOCUMENT_SCROLL_CLASS);
      body.classList.remove(DOCUMENT_SCROLL_CLASS);
      root.classList.remove(DOCUMENT_SCROLL_LOCKED_CLASS);
      body.classList.remove(DOCUMENT_SCROLL_LOCKED_CLASS);
      history.scrollRestoration = previousScrollRestoration;
    };
  }, [enabled]);

  useInsertionEffect(() => {
    const shouldLock = enabled && locked;
    if (shouldLock) {
      lockedScrollY.current ??= window.scrollY;
    }
    document.documentElement.classList.toggle(
      DOCUMENT_SCROLL_LOCKED_CLASS,
      shouldLock,
    );
    document.body.classList.toggle(DOCUMENT_SCROLL_LOCKED_CLASS, shouldLock);
  }, [enabled, locked]);

  useLayoutEffect(() => {
    if (!enabled) {
      lockedScrollY.current = null;
      return;
    }

    if (locked || lockedScrollY.current === null) return;
    const scrollY = lockedScrollY.current;
    lockedScrollY.current = null;
    window.scrollTo({ top: scrollY, behavior: "auto" });
  }, [enabled, locked]);
}

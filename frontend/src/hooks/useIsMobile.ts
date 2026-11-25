import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)";
const TABLET_QUERY = "(min-width: 768px) and (max-width: 1365px)";

function matchesMedia(query: string): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(query).matches;
  }
  if (query === MOBILE_QUERY) return window.innerWidth < 768;
  return window.innerWidth >= 768 && window.innerWidth < 1366;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => matchesMedia(MOBILE_QUERY));

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const mql = window.matchMedia(MOBILE_QUERY);
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

export function useBreakpoint(): { isMobile: boolean; isTablet: boolean } {
  const isMobile = useIsMobile();
  const [isTablet, setIsTablet] = useState(() => matchesMedia(TABLET_QUERY));

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") {
      const handleResize = () =>
        setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1366);
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const mql = window.matchMedia(TABLET_QUERY);
    const handleChange = (e: MediaQueryListEvent) => setIsTablet(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return { isMobile, isTablet };
}

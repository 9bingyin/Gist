import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app shell viewport sizing", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const cssSource = readFileSync("src/index.css", "utf8");

  it("wraps the app in a fixed-height shell", () => {
    expect(appSource).toContain('className="app-shell"');
    expect(cssSource).toContain(".app-shell");
    expect(cssSource).toContain("height: 100%;");
  });

  it("uses large viewport height in standalone PWA mode", () => {
    expect(cssSource).toContain("@media (display-mode: standalone)");
    expect(cssSource).toContain("--app-dvh: 100lvh;");
  });

  it("allows the mobile article list to use document scrolling", () => {
    expect(cssSource).toContain("html.mobile-document-scroll");
    expect(cssSource).toContain("min-height: var(--app-dvh);");
    expect(cssSource).toContain("overflow-y: auto;");
    expect(cssSource).toContain("mobile-document-scroll-locked");
  });

  it("does not change root overflow when the mobile sidebar opens", () => {
    expect(appSource).toContain(
      'locked: usesMobileDocumentScroll && mobileView === "detail"',
    );
  });
});

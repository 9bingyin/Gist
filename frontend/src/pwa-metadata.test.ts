import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("iOS PWA metadata", () => {
  it("keeps web content outside the iOS 27 translucent status bar", () => {
    expect(indexHtml).toContain(
      'name="apple-mobile-web-app-status-bar-style" content="default"',
    );
    expect(indexHtml).not.toContain('content="black-translucent"');
  });

  it("provides matching light and dark colors before the app loads", () => {
    expect(indexHtml).toContain('name="color-scheme" content="light dark"');
    expect(indexHtml).toContain('content="#FFFFFF"');
    expect(indexHtml).toContain('content="#09090B"');
    expect(indexHtml).toContain(
      'root.dataset.theme = isDark ? "dark" : "light"',
    );
    expect(indexHtml).toContain("background-color: #09090b");
  });
});

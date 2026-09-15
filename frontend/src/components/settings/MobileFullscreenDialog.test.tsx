import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileFullscreenDialog } from "./MobileFullscreenDialog";

function renderOpenDialog() {
  const result = render(
    <MobileFullscreenDialog
      open
      onOpenChange={vi.fn()}
      header={<h2>Settings</h2>}
    >
      <button type="button">inner action</button>
    </MobileFullscreenDialog>,
  );
  const scroller = document.querySelector(
    '[data-slot="mobile-dialog-scroller"]',
  );

  if (!(scroller instanceof HTMLElement)) {
    throw new Error("Mobile dialog scroller is missing");
  }

  return { ...result, scroller };
}

describe("MobileFullscreenDialog", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  });

  it("uses the dialog itself as the overflow scroller without locking root overflow", () => {
    const { scroller } = renderOpenDialog();

    expect(scroller.getAttribute("role")).toBe("dialog");
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("inset-0");
    expect(scroller.className).toContain("overscroll-y-contain");
    expect(scroller.className).not.toContain("overflow-hidden");
    expect(scroller.className).not.toContain("zoom-in-95");
    expect(scroller.className).not.toContain("-translate-x-1/2");
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("keeps the header sticky above scrollable content", () => {
    renderOpenDialog();
    const header = screen.getByRole("heading", { name: "Settings" });
    expect(header.parentElement?.className).toContain("sticky");
    expect(screen.getByRole("button", { name: "inner action" })).toBeTruthy();
  });
});

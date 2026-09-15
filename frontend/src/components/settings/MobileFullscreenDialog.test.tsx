import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileFullscreenDialog } from "./MobileFullscreenDialog";

function dispatchScrollGesture(
  target: EventTarget,
  type: "touchmove" | "wheel",
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

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
  const overlay = document.querySelector('[data-radix-dialog-overlay]');

  if (!(scroller instanceof HTMLElement)) {
    throw new Error("Mobile dialog scroller is missing");
  }

  return { ...result, scroller, overlay };
}

describe("MobileFullscreenDialog", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  });

  it("creates an inner overflow scroller without locking root overflow", () => {
    const { scroller } = renderOpenDialog();

    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("overscroll-y-contain");
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("blocks background scrolling but allows scrolling the dialog content", () => {
    const { scroller, overlay } = renderOpenDialog();
    const innerAction = screen.getByRole("button", { name: "inner action" });

    expect(dispatchScrollGesture(scroller, "touchmove").defaultPrevented).toBe(
      false,
    );
    expect(dispatchScrollGesture(innerAction, "wheel").defaultPrevented).toBe(
      false,
    );
    if (overlay) {
      expect(dispatchScrollGesture(overlay, "touchmove").defaultPrevented).toBe(
        true,
      );
    }
    expect(
      dispatchScrollGesture(document.body, "touchmove").defaultPrevented,
    ).toBe(true);
  });

  it("does not apply transform zoom animations that break iOS overflow", () => {
    renderOpenDialog();
    const content = document.querySelector('[role="dialog"]');

    expect(content).toBeTruthy();
    expect(content?.className).toContain("inset-0");
    expect(content?.className).toContain("h-[var(--app-dvh)]");
    expect(content?.className).toContain("overflow-hidden");
    expect(content?.className).not.toContain("zoom-in-95");
    expect(content?.className).not.toContain("-translate-x-1/2");
  });

  it("removes background scroll listeners when unmounted", () => {
    const { unmount } = renderOpenDialog();
    unmount();

    expect(
      dispatchScrollGesture(document.body, "touchmove").defaultPrevented,
    ).toBe(false);
  });
});

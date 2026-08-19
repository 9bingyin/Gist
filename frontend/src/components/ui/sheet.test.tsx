import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet";

vi.mock("framer-motion", async () => {
  const { forwardRef } = await import("react");

  interface MockMotionDivProps {
    children?: React.ReactNode;
    className?: string;
    onClick?: () => void;
    "data-slot"?: string;
  }

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: forwardRef<HTMLDivElement, MockMotionDivProps>(
        function MockMotionDiv(
          { children, className, onClick, "data-slot": dataSlot },
          ref,
        ) {
          return (
            <div
              ref={ref}
              className={className}
              data-slot={dataSlot}
              onClick={onClick}
            >
              {children}
            </div>
          );
        },
      ),
    },
  };
});

function dispatchScrollGesture(
  target: Element,
  type: "touchmove" | "wheel",
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function renderOpenSheet(onOpenChange = vi.fn()) {
  const result = render(
    <Sheet open onOpenChange={onOpenChange}>
      <button type="button">menu item</button>
    </Sheet>,
  );
  const overlay = result.container.querySelector('[data-slot="sheet-overlay"]');
  const content = result.container.querySelector('[data-slot="sheet-content"]');

  if (!overlay || !content) {
    throw new Error("Sheet overlay or content is missing");
  }

  return { ...result, onOpenChange, overlay };
}

describe("Sheet", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  it("blocks background scrolling without changing root overflow", () => {
    const { overlay } = renderOpenSheet();
    const menuItem = screen.getByRole("button", { name: "menu item" });

    expect(document.body.style.overflow).toBe("");
    expect(dispatchScrollGesture(overlay, "touchmove").defaultPrevented).toBe(
      true,
    );
    expect(dispatchScrollGesture(overlay, "wheel").defaultPrevented).toBe(true);
    expect(dispatchScrollGesture(menuItem, "touchmove").defaultPrevented).toBe(
      false,
    );
  });

  it("closes when Escape is pressed", () => {
    const { onOpenChange } = renderOpenSheet();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("removes background scroll listeners when unmounted", () => {
    const { unmount } = renderOpenSheet();
    unmount();

    expect(
      dispatchScrollGesture(document.body, "touchmove").defaultPrevented,
    ).toBe(false);
  });
});

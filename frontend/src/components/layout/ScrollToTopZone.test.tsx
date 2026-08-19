import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollToTopZone } from "./ScrollToTopZone";

describe("ScrollToTopZone", () => {
  it("provides an opaque top-edge color for iOS WebKit", () => {
    const { container } = render(<ScrollToTopZone />);
    const zone = container.firstElementChild;

    expect(zone?.classList.contains("bg-background")).toBe(true);
  });
});

import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { MobileDocumentHeader } from "./MobileDocumentHeader";
import { useLightboxStore } from "@/stores/lightbox-store";
import { useImagePreviewStore } from "@/stores/image-preview-store";
import type { Entry } from "@/types/api";

const mockEntry: Entry = {
  id: "1",
  feedId: "f1",
  title: "t",
  url: "https://example.com",
  thumbnailUrl: "https://example.com/a.jpg",
  read: false,
  starred: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderHeader() {
  const headerRef = createRef<HTMLDivElement>();
  return render(
    <MobileDocumentHeader
      enabled
      headerRef={headerRef}
      testId="picture-masonry-header"
    >
      <span>全部图片</span>
    </MobileDocumentHeader>,
  );
}

describe("MobileDocumentHeader", () => {
  beforeEach(() => {
    useLightboxStore.getState().reset();
    useImagePreviewStore.getState().reset();
  });

  it("hides while lightbox is open so list chrome cannot stack over media", () => {
    renderHeader();

    const header = screen.getByTestId("picture-masonry-header");
    expect(header.className).not.toContain("invisible");

    act(() => {
      useLightboxStore
        .getState()
        .open(mockEntry, undefined, [mockEntry.thumbnailUrl!]);
    });

    expect(header.className).toContain("invisible");
    expect(header.getAttribute("aria-hidden")).toBe("true");
  });

  it("hides while image preview is open", () => {
    renderHeader();
    const header = screen.getByTestId("picture-masonry-header");

    act(() => {
      useImagePreviewStore.getState().open(["https://example.com/a.jpg"]);
    });

    expect(header.className).toContain("invisible");
  });
});

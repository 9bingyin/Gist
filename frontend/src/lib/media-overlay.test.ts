import { describe, expect, it } from "vitest";
import {
  MEDIA_OVERLAY_CLASSNAME,
  MEDIA_OVERLAY_TOP_END_CLASSNAME,
  MEDIA_OVERLAY_TOP_START_CLASSNAME,
} from "./media-overlay";

describe("media overlay chrome", () => {
  it("uses an opaque full-viewport layer above document headers", () => {
    expect(MEDIA_OVERLAY_CLASSNAME).toContain("fixed");
    expect(MEDIA_OVERLAY_CLASSNAME).toContain("inset-0");
    expect(MEDIA_OVERLAY_CLASSNAME).toContain("bg-black");
    expect(MEDIA_OVERLAY_CLASSNAME).toContain("z-[100]");
    expect(MEDIA_OVERLAY_CLASSNAME).not.toContain("bg-black/90");
    expect(MEDIA_OVERLAY_CLASSNAME).not.toContain("h-dvh");
  });

  it("offsets controls with safe-area insets when available", () => {
    expect(MEDIA_OVERLAY_TOP_END_CLASSNAME).toContain(
      "env(safe-area-inset-top,0px)",
    );
    expect(MEDIA_OVERLAY_TOP_END_CLASSNAME).toContain(
      "env(safe-area-inset-right,0px)",
    );
    expect(MEDIA_OVERLAY_TOP_START_CLASSNAME).toContain(
      "env(safe-area-inset-left,0px)",
    );
  });
});

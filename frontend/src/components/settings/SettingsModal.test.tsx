import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("./tabs/GeneralSettings", () => ({
  GeneralSettings: () => <div>general-settings</div>,
}));
vi.mock("./tabs/NetworkSettings", () => ({
  NetworkSettings: () => <div>network-settings</div>,
}));
vi.mock("./tabs/AppearanceSettings", () => ({
  AppearanceSettings: () => <div>appearance-settings</div>,
}));
vi.mock("./tabs/AISettings", () => ({
  AISettings: () => <div>ai-settings</div>,
}));
vi.mock("./tabs/DataControl", () => ({
  DataControl: () => <div>data-settings</div>,
}));
vi.mock("./tabs/FeedsSettings", () => ({
  FeedsSettings: () => <div>feeds-settings</div>,
}));
vi.mock("./tabs/FoldersSettings", () => ({
  FoldersSettings: () => <div>folders-settings</div>,
}));
vi.mock("./tabs/AdvancedSettings", () => ({
  AdvancedSettings: () => <div>advanced-settings</div>,
}));

vi.mock("./SettingsSidebar", () => ({
  SettingsSidebar: ({
    children,
  }: {
    children?: ReactNode;
  }) => <div>{children}</div>,
}));

describe("SettingsModal", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 390,
    });
    document.body.style.overflow = "";
  });

  it("renders a scrollable fullscreen surface on mobile", () => {
    render(<SettingsModal open onOpenChange={vi.fn()} />);

    const scroller = document.querySelector(
      '[data-slot="mobile-dialog-scroller"]',
    );
    expect(scroller).toBeTruthy();
    expect(scroller?.className).toContain("overflow-y-auto");
    expect(screen.getByText("general-settings")).toBeTruthy();
    expect(document.body.style.overflow).toBe("");
  });
});

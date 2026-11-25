import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { EditFeedDialog } from "./EditFeedDialog";
import type { Feed } from "@/types/api";

const { mockMutateAsync, mockOnOpenChange, mockUseUpdateFeed } = vi.hoisted(
  () => ({
    mockMutateAsync: vi.fn(),
    mockOnOpenChange: vi.fn(),
    mockUseUpdateFeed: vi.fn(),
  }),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useFeeds", () => ({
  useUpdateFeed: mockUseUpdateFeed,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DialogHeader: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function buildFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "feed-1",
    title: "Feed Title",
    url: "https://example.com/feed.xml",
    folderId: "folder-1",
    type: "article",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("EditFeedDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
    mockUseUpdateFeed.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
  });

  it("会回填 feed 标题和摘要自定义提示词", () => {
    render(
      <EditFeedDialog
        feed={buildFeed({ summaryPromptReminder: "关注核心结论" })}
        open
        onOpenChange={mockOnOpenChange}
      />,
    );

    expect(screen.getByLabelText("feeds.feed_title")).toHaveProperty(
      "value",
      "Feed Title",
    );
    expect(
      screen.getByLabelText("feeds.summary_prompt_reminder"),
    ).toHaveProperty("value", "关注核心结论");
  });

  it("保存时会提交摘要自定义提示词", async () => {
    render(
      <EditFeedDialog
        feed={buildFeed({ summaryPromptReminder: "旧提示" })}
        open
        onOpenChange={mockOnOpenChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("feeds.feed_title"), {
      target: { value: "新标题" },
    });
    fireEvent.change(screen.getByLabelText("feeds.summary_prompt_reminder"), {
      target: { value: "优先概括关键数据" },
    });
    fireEvent.click(screen.getByRole("button", { name: "actions.save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: "feed-1",
        title: "新标题",
        folderId: "folder-1",
        summaryPromptReminder: "优先概括关键数据",
      });
    });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("允许提交超过 2000 字符的长提示词", async () => {
    render(
      <EditFeedDialog
        feed={buildFeed()}
        open
        onOpenChange={mockOnOpenChange}
      />,
    );

    const longPrompt = "a".repeat(2500);
    fireEvent.change(screen.getByLabelText("feeds.summary_prompt_reminder"), {
      target: { value: longPrompt },
    });

    const saveButton = screen.getByRole("button", {
      name: "actions.save",
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: "feed-1",
        title: "Feed Title",
        folderId: "folder-1",
        summaryPromptReminder: longPrompt,
      });
    });
  });
});

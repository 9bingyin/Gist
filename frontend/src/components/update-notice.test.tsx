import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateNotice } from "./update-notice";

const worker = vi.hoisted(() => ({
  addEventListener: vi.fn<(type: string, callback: () => void) => void>(),
  removeEventListener: vi.fn(),
  register: vi.fn(),
  messageSkipWaiting: vi.fn(),
}));

vi.mock("workbox-window", () => ({
  Workbox: class {
    addEventListener = worker.addEventListener;
    removeEventListener = worker.removeEventListener;
    register = worker.register;
    messageSkipWaiting = worker.messageSkipWaiting;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { serviceWorker: {}, onLine: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PWA update notice", () => {
  it("prompts for a waiting update and cleans up its listeners", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { unmount } = render(<UpdateNotice />);
    await waitFor(() => expect(worker.register).toHaveBeenCalledOnce());
    expect(screen.queryByText("update.available")).toBeNull();

    const waiting = worker.addEventListener.mock.calls.find(
      ([event]) => event === "waiting",
    )?.[1];
    expect(waiting).toBeDefined();
    act(() => waiting?.());
    fireEvent.click(screen.getByText("update.available"));
    expect(worker.messageSkipWaiting).toHaveBeenCalledOnce();

    unmount();
    expect(worker.removeEventListener).toHaveBeenCalledWith("waiting", waiting);
    expect(worker.removeEventListener).toHaveBeenCalledWith(
      "controlling",
      expect.any(Function),
    );
  });

  it("does not register a service worker during development", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<UpdateNotice />);
    expect(worker.register).not.toHaveBeenCalled();
  });
});

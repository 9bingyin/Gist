import { create } from "zustand";
import {
  checkAuthStatus,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getCurrentUser,
  setAuthToken,
  clearAuthToken,
  getAuthToken,
  setOnUnauthorized,
  type AuthUser,
} from "@/api";
import { isNetworkError } from "@/lib/errors";
import { queryClient } from "@/lib/queryClient";
import { clearEntryScrollPositions } from "@/hooks/useEntryContentScroll";
import { useTranslationStore } from "@/stores/translation-store";
import { useLightboxStore } from "@/stores/lightbox-store";
import { useImagePreviewStore } from "@/stores/image-preview-store";
import i18n from "@/i18n";

export type AuthState =
  "loading" | "unauthenticated" | "no-user" | "authenticated" | "network-error";

interface AuthStore {
  // State
  state: AuthState;
  user: AuthUser | null;
  error: string | null;
  shouldRedirectToRoot: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (
    username: string,
    nickname: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  handleUnauthorized: () => void;
  consumeRootRedirect: () => void;
  retry: () => void;
  clearError: () => void;
  setUser: (user: AuthUser) => void;
}

const sessionResetListeners = new Set<() => void>();

export function registerSessionResetListener(listener: () => void): () => void {
  sessionResetListeners.add(listener);
  return () => {
    sessionResetListeners.delete(listener);
  };
}

function clearClientSessionState(): void {
  queryClient.clear();
  useTranslationStore.getState().clearAll();
  useLightboxStore.getState().reset();
  useImagePreviewStore.getState().reset();
  clearEntryScrollPositions();
  for (const listener of sessionResetListeners) {
    listener();
  }
}

let initializePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthStore>((set, get) => {
  // Set up unauthorized callback
  setOnUnauthorized(() => {
    get().handleUnauthorized();
  });

  return {
    state: "loading",
    user: null,
    error: null,
    shouldRedirectToRoot: false,

    initialize: async () => {
      if (initializePromise) {
        return initializePromise;
      }

      initializePromise = (async () => {
        try {
          const { exists } = await checkAuthStatus();

          if (!exists) {
            set({ state: "no-user", user: null });
            return;
          }

          const token = getAuthToken();
          if (!token) {
            set({ state: "unauthenticated", user: null });
            return;
          }

          try {
            const user = await getCurrentUser();
            set({ state: "authenticated", user });
          } catch (innerErr) {
            if (isNetworkError(innerErr)) {
              set({ state: "network-error", user: null });
              return;
            }
            get().handleUnauthorized();
          }
        } catch (err) {
          if (isNetworkError(err)) {
            set({ state: "network-error", user: null });
            return;
          }
          console.error("Failed to initialize auth:", err);
          set({ state: "unauthenticated", user: null });
        } finally {
          initializePromise = null;
        }
      })();

      return initializePromise;
    },

    login: async (identifier: string, password: string) => {
      set({ error: null });
      try {
        const response = await apiLogin(identifier, password);
        setAuthToken(response.token);
        set({ state: "authenticated", user: response.user });
      } catch (err) {
        const message = isNetworkError(err)
          ? i18n.t("auth.network_error")
          : err instanceof Error
            ? err.message
            : "Login failed";
        set({ error: message });
        throw err;
      }
    },

    register: async (
      username: string,
      nickname: string,
      email: string,
      password: string,
    ) => {
      set({ error: null });
      try {
        const response = await apiRegister(username, nickname, email, password);
        setAuthToken(response.token);
        set({ state: "authenticated", user: response.user });
      } catch (err) {
        const message = isNetworkError(err)
          ? i18n.t("auth.network_error")
          : err instanceof Error
            ? err.message
            : "Registration failed";
        set({ error: message });
        throw err;
      }
    },

    logout: async () => {
      try {
        await apiLogout();
      } catch {
        // Ignore errors, still clear local state
      }
      clearAuthToken();
      clearClientSessionState();
      set({
        state: "unauthenticated",
        user: null,
        error: null,
        shouldRedirectToRoot: true,
      });
    },

    handleUnauthorized: () => {
      clearAuthToken();
      clearClientSessionState();
      set({
        state: "unauthenticated",
        user: null,
        error: null,
        shouldRedirectToRoot: true,
      });
    },

    consumeRootRedirect: () => {
      set({ shouldRedirectToRoot: false });
    },

    retry: () => {
      set({ state: "loading", error: null });
      void get().initialize();
    },

    clearError: () => {
      set({ error: null });
    },

    setUser: (user: AuthUser) => {
      set({ user });
    },
  };
});

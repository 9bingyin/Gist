import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/stores/auth-store";

export function useAuth() {
  const {
    state,
    user,
    error,
    shouldRedirectToRoot,
    login,
    register,
    logout,
    retry,
    clearError,
    consumeRootRedirect,
  } = useAuthStore(
    useShallow((s) => ({
      state: s.state,
      user: s.user,
      error: s.error,
      shouldRedirectToRoot: s.shouldRedirectToRoot,
      login: s.login,
      register: s.register,
      logout: s.logout,
      retry: s.retry,
      clearError: s.clearError,
      consumeRootRedirect: s.consumeRootRedirect,
    })),
  );

  return {
    isLoading: state === "loading",
    isAuthenticated: state === "authenticated",
    needsRegistration: state === "no-user",
    needsLogin: state === "unauthenticated",
    isNetworkError: state === "network-error",
    user,
    error,
    shouldRedirectToRoot,

    login,
    register,
    logout,
    retry,
    clearError,
    consumeRootRedirect,
  };
}

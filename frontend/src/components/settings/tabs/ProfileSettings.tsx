import { useState, useEffect, useRef, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { getCurrentUser, updateProfile, setAuthToken } from "@/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

export function ProfileSettings() {
  const { t } = useTranslation();
  const { user, setUser } = useAuthStore(
    useShallow((s) => ({ user: s.user, setUser: s.setUser })),
  );
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoadingNickname, setIsLoadingNickname] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [emailStatus, setEmailStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const scheduleReset = (callback: () => void, delayMs: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      callback();
    }, delayMs);
    timersRef.current.add(id);
  };

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) {
        clearTimeout(id);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setNickname(user.nickname);
      setEmail(user.email);
      return;
    }

    let cancelled = false;
    getCurrentUser()
      .then((userData) => {
        if (cancelled) return;
        setUsername(userData.username);
        setNickname(userData.nickname);
        setEmail(userData.email);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSaveNickname = async () => {
    setIsLoadingNickname(true);
    setNicknameStatus("idle");
    setError(null);
    try {
      const result = await updateProfile({ nickname });
      setUser(result.user);
      setNicknameStatus("success");
      scheduleReset(() => setNicknameStatus("idle"), 2000);
    } catch (err) {
      setNicknameStatus("error");
      setError(
        err instanceof Error ? err.message : "Failed to update nickname",
      );
    } finally {
      setIsLoadingNickname(false);
    }
  };

  const handleSaveEmail = async () => {
    setIsLoadingEmail(true);
    setEmailStatus("idle");
    setError(null);
    try {
      const result = await updateProfile({ email });
      setUser(result.user);
      setEmailStatus("success");
      scheduleReset(() => setEmailStatus("idle"), 2000);
    } catch (err) {
      setEmailStatus("error");
      setError(err instanceof Error ? err.message : "Failed to update email");
    } finally {
      setIsLoadingEmail(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t("auth.password_mismatch"));
      return;
    }

    if (newPassword.length < 6) {
      setError(t("auth.password_too_short"));
      return;
    }

    setIsLoadingPassword(true);
    setPasswordStatus("idle");
    try {
      const result = await updateProfile({ currentPassword, newPassword });
      if (result.token) {
        setAuthToken(result.token);
      }
      setPasswordStatus("success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      scheduleReset(() => setPasswordStatus("idle"), 2000);
    } catch (err) {
      setPasswordStatus("error");
      setError(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setIsLoadingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            {t("actions.close")}
          </button>
        </div>
      )}

      {/* Username Section (Read-only) */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t("profile.username")}</div>
            <div className="text-xs text-muted-foreground">
              {t("profile.username_readonly")}
            </div>
          </div>
          <input
            type="text"
            value={username}
            disabled
            className={cn(
              "h-9 w-48 max-w-full shrink-0 rounded-md border border-border bg-muted px-3 text-sm",
              "text-muted-foreground cursor-not-allowed",
            )}
          />
        </div>
      </section>

      {/* Nickname Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t("profile.nickname")}</div>
            <div className="text-xs text-muted-foreground">
              {t("profile.nickname_hint")}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className={cn(
                "h-9 w-48 max-w-full rounded-md border border-border bg-background px-3 text-sm",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              )}
            />
            <button
              type="button"
              onClick={handleSaveNickname}
              disabled={isLoadingNickname || !nickname}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium transition-colors shrink-0",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:cursor-not-allowed disabled:opacity-50",
                nicknameStatus === "success" &&
                  "bg-green-600 hover:bg-green-600",
                nicknameStatus === "error" &&
                  "bg-destructive hover:bg-destructive",
              )}
            >
              {isLoadingNickname
                ? t("profile.saving")
                : nicknameStatus === "success"
                  ? t("profile.saved")
                  : t("profile.save_nickname")}
            </button>
          </div>
        </div>
      </section>

      {/* Email Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">{t("profile.email")}</div>
          <div className="flex shrink-0 gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                "h-9 w-48 max-w-full rounded-md border border-border bg-background px-3 text-sm",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              )}
            />
            <button
              type="button"
              onClick={handleSaveEmail}
              disabled={isLoadingEmail || !email}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium transition-colors shrink-0",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:cursor-not-allowed disabled:opacity-50",
                emailStatus === "success" && "bg-green-600 hover:bg-green-600",
                emailStatus === "error" &&
                  "bg-destructive hover:bg-destructive",
              )}
            >
              {isLoadingEmail
                ? t("profile.saving")
                : emailStatus === "success"
                  ? t("profile.saved")
                  : t("profile.save_email")}
            </button>
          </div>
        </div>
      </section>

      {/* Change Password Section */}
      <section>
        <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("profile.change_password")}
        </div>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {t("profile.current_password")}
            </div>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={cn(
                "h-9 w-48 max-w-full shrink-0 rounded-md border border-border bg-background px-3 text-sm",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              )}
              autoComplete="current-password"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {t("profile.new_password")}
            </div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={cn(
                "h-9 w-48 max-w-full shrink-0 rounded-md border border-border bg-background px-3 text-sm",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              )}
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {t("profile.confirm_new_password")}
            </div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={cn(
                "h-9 w-48 max-w-full shrink-0 rounded-md border border-border bg-background px-3 text-sm",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              )}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={
                isLoadingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:cursor-not-allowed disabled:opacity-50",
                passwordStatus === "success" &&
                  "bg-green-600 hover:bg-green-600",
                passwordStatus === "error" &&
                  "bg-destructive hover:bg-destructive",
              )}
            >
              {isLoadingPassword
                ? t("profile.saving")
                : passwordStatus === "success"
                  ? t("profile.password_changed")
                  : t("profile.save_password")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

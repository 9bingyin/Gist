import * as React from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { LogOut, Settings, Star, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RootPortal } from "@/components/ui/portal";

const menuItemStyles = cn(
  "group relative flex cursor-pointer select-none items-center gap-2",
  "rounded-[5px] px-2.5 py-1 text-sm font-medium",
  "text-foreground/90 outline-none transition-colors duration-150",
  "focus:bg-accent/30 data-[highlighted]:bg-accent/20",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "h-[28px]",
);

interface ProfileButtonProps {
  avatarUrl?: string;
  userName?: string;
  starredCount?: number;
  isStarredSelected?: boolean;
  onStarredClick?: () => void;
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
  onLogoutClick?: () => void;
}

const UserAvatar = React.forwardRef<
  HTMLSpanElement,
  {
    className?: string;
    avatarUrl?: string;
    style?: React.CSSProperties;
    onTransitionEnd?: () => void;
    hideName?: boolean;
  }
>(({ className, avatarUrl, style, onTransitionEnd }, ref) => (
  <span
    ref={ref}
    style={style}
    onTransitionEnd={onTransitionEnd}
    className={cn(
      "relative flex shrink-0 overflow-hidden rounded-full border bg-muted select-none",
      className,
    )}
  >
    {avatarUrl ? (
      <img className="size-full object-cover" src={avatarUrl} alt="" />
    ) : (
      <User className="size-full p-1 text-muted-foreground" />
    )}
  </span>
));

UserAvatar.displayName = "UserAvatar";

const AVATAR_SIZE = 56;
const AVATAR_INITIAL_SCALE = 24 / AVATAR_SIZE;

const TransitionAvatar = React.forwardRef<
  HTMLButtonElement,
  {
    stage: "zoom-in" | "";
    avatarUrl?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(
  (
    { stage, avatarUrl, className, onPointerDown, onClick, ...props },
    forwardRef,
  ) => {
    const avatarRef = React.useRef<HTMLSpanElement>(null);
    const [origin, setOrigin] = React.useState<{ x: number; y: number } | null>(
      null,
    );
    const zoomIn = stage === "zoom-in";

    const measure = React.useCallback(() => {
      const rect = avatarRef.current?.getBoundingClientRect();
      if (!rect || (rect.x === 0 && rect.y === 0)) return;
      setOrigin({ x: rect.x, y: rect.y });
    }, []);

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        measure();
        onPointerDown?.(e);
      },
      [measure, onPointerDown],
    );

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        measure();
        onClick?.(e);
      },
      [measure, onClick],
    );

    return (
      <>
        <button
          type="button"
          {...props}
          ref={forwardRef}
          className={cn(
            "group relative inline-flex items-center justify-center rounded-md size-8 outline-none focus-visible:ring-2 focus-visible:ring-ring select-none",
            className,
          )}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
        >
          <UserAvatar
            ref={avatarRef}
            className="size-6 border-0"
            avatarUrl={avatarUrl}
          />
        </button>

        <RootPortal>
          <AnimatePresence>
            {zoomIn && origin && (
              <motion.div
                style={{
                  left: origin.x - 16,
                  top: origin.y,
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  transformOrigin: "top center",
                }}
                initial={{
                  x: 0,
                  y: 0,
                  scale: AVATAR_INITIAL_SCALE,
                  opacity: 0.5,
                }}
                animate={{
                  x: 0,
                  y: 0,
                  scale: 1,
                  opacity: 1,
                }}
                exit={{
                  x: 0,
                  y: 0,
                  scale: AVATAR_INITIAL_SCALE,
                  opacity: 0,
                }}
                transition={{
                  duration: 0.2,
                  ease: [0.4, 0, 0.2, 1],
                }}
                className="fixed p-0 border-0 pointer-events-none rounded-full overflow-hidden bg-muted z-[100] transform-gpu shadow-xl select-none"
              >
                {avatarUrl ? (
                  <img
                    className="size-full object-cover"
                    src={avatarUrl}
                    alt=""
                  />
                ) : (
                  <User className="size-full p-2 text-muted-foreground" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </RootPortal>
      </>
    );
  },
);
TransitionAvatar.displayName = "TransitionAvatar";

export function ProfileButton({
  avatarUrl,
  userName,
  starredCount = 0,
  isStarredSelected = false,
  onStarredClick,
  onProfileClick,
  onSettingsClick,
  onLogoutClick,
}: ProfileButtonProps) {
  const { t } = useTranslation();
  const displayName = userName || t("user.guest");
  const [isOpen, setIsOpen] = React.useState(false);
  const iconStyles =
    "size-4 text-muted-foreground transition-colors group-data-[highlighted]:text-foreground";

  return (
    <DropdownMenu onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <TransitionAvatar
          stage={isOpen ? "zoom-in" : ""}
          avatarUrl={avatarUrl}
          aria-label={t("user.profile")}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className={cn(
          "min-w-[240px] p-1 overflow-visible",
          "backdrop-blur-2xl",
          "border-border/40",
          "bg-[linear-gradient(to_bottom_right,_hsl(var(--background)_/_0.98),_hsl(var(--background)_/_0.95))]",
          "shadow-[0_6px_20px_rgba(0,0,0,0.08),_0_4px_12px_rgba(0,0,0,0.05),_0_2px_6px_rgba(0,0,0,0.04),_0_4px_16px_hsl(var(--primary)_/_0.06),_0_2px_8px_hsl(var(--primary)_/_0.04),_0_1px_3px_rgba(0,0,0,0.03)]",
        )}
        side="bottom"
        align="center"
        sideOffset={10}
      >
        <div className="pointer-events-none absolute inset-0 rounded-md bg-[linear-gradient(to_bottom_right,_hsl(var(--primary)_/_0.02),_transparent,_hsl(var(--primary)_/_0.02))]" />

        {/* User info */}
        <DropdownMenuLabel className="px-2 pb-3 pt-6 relative z-10 text-center">
          <div className="flex flex-col items-center justify-center">
            <div className="max-w-[20ch] truncate text-lg font-semibold tracking-tight text-foreground">
              {displayName}
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-border/50" />

        {/* Profile */}
        <DropdownMenuItem className={menuItemStyles} onSelect={onProfileClick}>
          <span className="inline-flex size-4 items-center justify-center">
            <User className={iconStyles} strokeWidth={1.5} />
          </span>
          <span>{t("user.profile")}</span>
        </DropdownMenuItem>

        {/* Starred */}
        <DropdownMenuItem
          className={cn(menuItemStyles, isStarredSelected && "bg-accent/30")}
          onSelect={onStarredClick}
        >
          <span className="inline-flex size-4 items-center justify-center">
            <Star className={iconStyles} strokeWidth={1.5} />
          </span>
          <span>{t("sidebar.starred")}</span>
          {starredCount > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {starredCount}
            </span>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border/50" />

        {/* Settings */}
        <DropdownMenuItem className={menuItemStyles} onSelect={onSettingsClick}>
          <span className="inline-flex size-4 items-center justify-center">
            <Settings className={iconStyles} strokeWidth={1.5} />
          </span>
          <span>{t("settings.title")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border/50" />

        {/* Logout */}
        <DropdownMenuItem className={menuItemStyles} onSelect={onLogoutClick}>
          <span className="inline-flex size-4 items-center justify-center">
            <LogOut className={iconStyles} strokeWidth={1.5} />
          </span>
          <span>{t("user.logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

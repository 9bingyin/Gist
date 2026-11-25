import { useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ChevronIcon } from "@/components/ui/icons";
import { useContextMenuTrigger } from "@/hooks/useContextMenu";
import { useCategoryState } from "@/hooks/useCategoryState";
import { feedItemStyles, sidebarItemIconStyles } from "./styles";
import type { ContentType } from "@/types/api";

interface FeedCategoryProps {
  name: string;
  folderId: string;
  unreadCount?: number;
  children: ReactNode;
  defaultOpen?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onDelete?: (folderId: string) => void;
  onChangeType?: (folderId: string, type: ContentType) => void;
}

export function FeedCategory({
  name,
  folderId,
  unreadCount,
  children,
  defaultOpen = false,
  isSelected = false,
  onSelect,
  onDelete,
  onChangeType,
}: FeedCategoryProps) {
  const { t } = useTranslation();
  const [open, , toggle] = useCategoryState(folderId, defaultOpen);
  const { triggerRef, contextMenuProps } =
    useContextMenuTrigger<HTMLDivElement>();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect?.();
      }
    },
    [onSelect],
  );

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild ref={triggerRef}>
          <div
            role="button"
            tabIndex={0}
            data-active={isSelected}
            className={cn(
              feedItemStyles,
              "group relative py-0.5 pl-2.5 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onClick={onSelect}
            onKeyDown={handleKeyDown}
            {...contextMenuProps}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-label={name}
              className="flex h-full items-center"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
            >
              <span className={sidebarItemIconStyles}>
                <ChevronIcon
                  className={cn(
                    "size-4 transition-transform duration-200",
                    open && "rotate-90",
                  )}
                />
              </span>
            </button>
            <span className="grow truncate font-semibold">{name}</span>
            {unreadCount !== undefined && unreadCount > 0 && (
              <span className="ml-2 shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
                {unreadCount}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {onChangeType && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                {t("actions.change_type")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem
                  onClick={() => onChangeType(folderId, "article")}
                >
                  {t("content_type.article")}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onChangeType(folderId, "picture")}
                >
                  {t("content_type.picture")}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onChangeType(folderId, "notification")}
                >
                  {t("content_type.notification")}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          {onDelete && (
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(folderId)}
            >
              {t("actions.delete")}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-px">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

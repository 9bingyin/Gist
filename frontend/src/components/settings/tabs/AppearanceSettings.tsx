import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Reorder } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "@/hooks/useTheme";
import {
  useAppearanceSettings,
  useUpdateAppearanceSettings,
} from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  FileTextIcon,
  ImageIcon,
  BellIcon,
  EyeOffIcon,
} from "@/components/ui/icons";
import type { ContentType } from "@/types/api";

const defaultContentTypes: ContentType[] = [
  "article",
  "picture",
  "notification",
];

export function AppearanceSettings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { data: appearanceSettings } = useAppearanceSettings();
  const updateAppearanceMutation = useUpdateAppearanceSettings();

  const themeOptions = useMemo(
    () => [
      {
        value: "system" as Theme,
        label: (
          <>
            <Monitor className="size-4" strokeWidth={1.5} />
            <span>{t("theme.system")}</span>
          </>
        ),
      },
      {
        value: "light" as Theme,
        label: (
          <>
            <Sun className="size-4" strokeWidth={1.5} />
            <span>{t("theme.light")}</span>
          </>
        ),
      },
      {
        value: "dark" as Theme,
        label: (
          <>
            <Moon className="size-4" strokeWidth={1.5} />
            <span>{t("theme.dark")}</span>
          </>
        ),
      },
    ],
    [t],
  );

  const enabledContentTypes = useMemo(() => {
    const current = appearanceSettings?.contentTypes;
    if (!current || current.length === 0) return defaultContentTypes;
    return current.filter(
      (item) =>
        item === "article" || item === "picture" || item === "notification",
    );
  }, [appearanceSettings]);

  const [orderedTypes, setOrderedTypes] =
    useState<ContentType[]>(enabledContentTypes);

  useEffect(() => {
    setOrderedTypes(enabledContentTypes);
  }, [enabledContentTypes]);

  // Derive disabled types directly from orderedTypes to avoid flicker
  const disabledContentTypes = useMemo(
    () => defaultContentTypes.filter((type) => !orderedTypes.includes(type)),
    [orderedTypes],
  );

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveContentTypes = useCallback(
    (nextTypes: ContentType[]) => {
      if (nextTypes.length === 0) return;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        updateAppearanceMutation.mutate({ contentTypes: nextTypes });
      }, 150);
    },
    [updateAppearanceMutation],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleRemoveType = useCallback(
    (type: ContentType) => {
      if (orderedTypes.length <= 1) return;
      const nextTypes = orderedTypes.filter((item) => item !== type);
      setOrderedTypes(nextTypes);
      saveContentTypes(nextTypes);
    },
    [orderedTypes, saveContentTypes],
  );

  const handleAddType = useCallback(
    (type: ContentType) => {
      const nextTypes = [...orderedTypes, type];
      setOrderedTypes(nextTypes);
      saveContentTypes(nextTypes);
    },
    [orderedTypes, saveContentTypes],
  );

  const handleReorder = useCallback(
    (nextTypes: ContentType[]) => {
      setOrderedTypes(nextTypes);
      saveContentTypes(nextTypes);
    },
    [saveContentTypes],
  );

  const contentTypeMeta: Record<
    ContentType,
    { label: string; icon: ReactNode }
  > = useMemo(
    () => ({
      article: {
        label: t("content_type.article"),
        icon: <FileTextIcon className="size-4" />,
      },
      picture: {
        label: t("content_type.picture"),
        icon: <ImageIcon className="size-4" />,
      },
      notification: {
        label: t("content_type.notification"),
        icon: <BellIcon className="size-4" />,
      },
    }),
    [t],
  );

  return (
    <div className="space-y-6">
      {/* Theme Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t("theme.label")}</div>
            <div className="text-xs text-muted-foreground">
              {t("theme.description")}
            </div>
          </div>
          <SegmentedControl
            className="shrink-0"
            value={theme}
            onValueChange={setTheme}
            options={themeOptions}
          />
        </div>
      </section>

      {/* Category View Section */}
      <section>
        <div className="mb-3">
          <div className="text-sm font-medium">
            {t("settings.appearance_categories")}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("settings.appearance_categories_description")}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Reorder.Group
              axis="x"
              values={orderedTypes}
              onReorder={handleReorder}
              className="flex flex-wrap gap-2"
              aria-label={t("settings.appearance_categories")}
            >
              {orderedTypes.map((type) => {
                const meta = contentTypeMeta[type];
                const isOnlyOne = orderedTypes.length <= 1;
                return (
                  <Reorder.Item
                    key={type}
                    value={type}
                    drag="x"
                    dragElastic={0}
                    dragTransition={{ bounceStiffness: 600, bounceDamping: 50 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "flex cursor-grab items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2",
                      "hover:border-border hover:shadow-sm",
                      "active:cursor-grabbing active:shadow-md active:z-10",
                    )}
                    aria-roledescription={t("settings.appearance_drag")}
                  >
                    <span className="text-muted-foreground">{meta.icon}</span>
                    <span className="text-sm font-medium">{meta.label}</span>
                    {!isOnlyOne && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveType(type);
                        }}
                        className={cn(
                          "ml-1 flex size-5 items-center justify-center rounded-md",
                          "text-muted-foreground/50 transition-colors",
                          "hover:bg-destructive/10 hover:text-destructive",
                        )}
                        title={t("settings.appearance_hide")}
                        aria-label={`${t("settings.appearance_hide")} ${meta.label}`}
                      >
                        <EyeOffIcon className="size-3.5" />
                      </button>
                    )}
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>

          {disabledContentTypes.length > 0 && (
            <div>
              <div className="mb-2 text-xs text-muted-foreground">
                {t("settings.appearance_hidden")}
              </div>
              <div className="flex flex-wrap gap-2">
                {disabledContentTypes.map((type) => {
                  const meta = contentTypeMeta[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleAddType(type)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-dashed border-border/50 px-3 py-2",
                        "text-muted-foreground/60 transition-colors",
                        "hover:border-primary/50 hover:bg-primary/5 hover:text-foreground",
                      )}
                    >
                      <span>{meta.icon}</span>
                      <span className="text-sm font-medium">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {orderedTypes.length <= 1 && (
            <div className="text-xs text-muted-foreground">
              {t("settings.appearance_keep_one")}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

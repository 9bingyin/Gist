import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "gist-category-state";

interface CategoryStore {
  openMap: Record<string, boolean>;
  setOpen: (category: string, isOpen: boolean) => void;
  toggle: (category: string) => void;
}

function readLegacyCategories(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if ("state" in parsed && typeof parsed.state === "object") {
      return {};
    }
    const result: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

const useCategoryStore = create<CategoryStore>()(
  persist(
    (set) => ({
      openMap: readLegacyCategories(),
      setOpen: (category, isOpen) =>
        set((state) => ({
          openMap: { ...state.openMap, [category]: isOpen },
        })),
      toggle: (category) =>
        set((state) => ({
          openMap: {
            ...state.openMap,
            [category]: !(state.openMap[category] ?? false),
          },
        })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ openMap: state.openMap }),
    },
  ),
);

export function useCategoryState(
  category: string,
  defaultOpen = false,
): [boolean, (isOpen: boolean) => void, () => void] {
  const isOpen = useCategoryStore(
    (state) => state.openMap[category] ?? defaultOpen,
  );

  const setOpen = useCallback(
    (open: boolean) => {
      useCategoryStore.getState().setOpen(category, open);
    },
    [category],
  );

  const toggle = useCallback(() => {
    useCategoryStore.getState().toggle(category);
  }, [category]);

  return [isOpen, setOpen, toggle];
}

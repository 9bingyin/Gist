import { useCallback, useSyncExternalStore } from 'react'

interface CategoryState {
  [categoryName: string]: boolean
}

const STORAGE_KEY = 'gist-category-state'

function getStoredState(): CategoryState {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // ignore parse errors
  }
  return {}
}

let cachedState: CategoryState = getStoredState()
const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot(): CategoryState {
  return cachedState
}

function setCategoryState(category: string, isOpen: boolean): void {
  cachedState = { ...cachedState, [category]: isOpen }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedState))
  } catch {
    // ignore storage errors
  }
  emitChange()
}

function toggleCategoryState(category: string): void {
  const currentState = cachedState[category] ?? false
  setCategoryState(category, !currentState)
}

export function useCategoryState(
  category: string,
  defaultOpen = false
): [boolean, (isOpen: boolean) => void, () => void] {
  const state = useSyncExternalStore(subscribe, getSnapshot, getStoredState)
  const isOpen = state[category] ?? defaultOpen

  const setOpen = useCallback(
    (open: boolean) => {
      setCategoryState(category, open)
    },
    [category]
  )

  const toggle = useCallback(() => {
    toggleCategoryState(category)
  }, [category])

  return [isOpen, setOpen, toggle]
}

export function useCategoryActions() {
  const expandAll = useCallback((categories: string[]) => {
    for (const category of categories) {
      setCategoryState(category, true)
    }
  }, [])

  const collapseAll = useCallback((categories: string[]) => {
    for (const category of categories) {
      setCategoryState(category, false)
    }
  }, [])

  return { expandAll, collapseAll }
}

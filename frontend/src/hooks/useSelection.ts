import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { parseRoute, buildPath } from "@/lib/router";
import type { ContentType } from "@/types/api";

export type SelectionType =
  | { type: "all" }
  | { type: "feed"; feedId: string }
  | { type: "folder"; folderId: string }
  | { type: "starred" };

interface NavigateOptions {
  replace?: boolean;
}

interface UseSelectionReturn {
  selection: SelectionType;
  selectAll: (contentType?: ContentType, options?: NavigateOptions) => void;
  selectFeed: (feedId: string, options?: NavigateOptions) => void;
  selectFolder: (folderId: string, options?: NavigateOptions) => void;
  selectStarred: (options?: NavigateOptions) => void;
  selectedEntryId: string | null;
  selectEntry: (entryId: string | null, options?: NavigateOptions) => void;
  unreadOnly: boolean;
  toggleUnreadOnly: () => void;
  contentType: ContentType;
}

export function useSelection(): UseSelectionReturn {
  const [location, navigate] = useLocation();
  const search = useSearch();

  const routeState = useMemo(
    () => parseRoute(location, search),
    [location, search],
  );

  const selectAll = useCallback(
    (contentType?: ContentType, options?: NavigateOptions) => {
      navigate(
        buildPath(
          { type: "all" },
          null,
          routeState.unreadOnly,
          contentType ?? routeState.contentType,
        ),
        options,
      );
    },
    [navigate, routeState.unreadOnly, routeState.contentType],
  );

  const selectFeed = useCallback(
    (feedId: string, options?: NavigateOptions) => {
      navigate(
        buildPath(
          { type: "feed", feedId },
          null,
          routeState.unreadOnly,
          routeState.contentType,
        ),
        options,
      );
    },
    [navigate, routeState.unreadOnly, routeState.contentType],
  );

  const selectFolder = useCallback(
    (folderId: string, options?: NavigateOptions) => {
      navigate(
        buildPath(
          { type: "folder", folderId },
          null,
          routeState.unreadOnly,
          routeState.contentType,
        ),
        options,
      );
    },
    [navigate, routeState.unreadOnly, routeState.contentType],
  );

  const selectStarred = useCallback(
    (options?: NavigateOptions) => {
      navigate(
        buildPath(
          { type: "starred" },
          null,
          routeState.unreadOnly,
          routeState.contentType,
        ),
        options,
      );
    },
    [navigate, routeState.unreadOnly, routeState.contentType],
  );

  const selectEntry = useCallback(
    (entryId: string | null, options?: NavigateOptions) => {
      navigate(
        buildPath(
          routeState.selection,
          entryId,
          routeState.unreadOnly,
          routeState.contentType,
        ),
        options,
      );
    },
    [
      navigate,
      routeState.selection,
      routeState.unreadOnly,
      routeState.contentType,
    ],
  );

  const toggleUnreadOnly = useCallback(() => {
    navigate(
      buildPath(
        routeState.selection,
        routeState.entryId,
        !routeState.unreadOnly,
        routeState.contentType,
      ),
      { replace: true },
    );
  }, [
    navigate,
    routeState.selection,
    routeState.entryId,
    routeState.unreadOnly,
    routeState.contentType,
  ]);

  return {
    selection: routeState.selection,
    selectAll,
    selectFeed,
    selectFolder,
    selectStarred,
    selectedEntryId: routeState.entryId,
    selectEntry,
    unreadOnly: routeState.unreadOnly,
    toggleUnreadOnly,
    contentType: routeState.contentType,
  };
}

export function selectionToParams(
  selection: SelectionType,
  contentType?: ContentType,
): {
  feedId?: string;
  folderId?: string;
  starredOnly?: boolean;
  contentType?: ContentType;
} {
  const base: {
    feedId?: string;
    folderId?: string;
    starredOnly?: boolean;
    contentType?: ContentType;
  } = {};

  if (selection.type === "all" && contentType) {
    base.contentType = contentType;
  }

  switch (selection.type) {
    case "all":
      return base;
    case "feed":
      return { ...base, feedId: selection.feedId };
    case "folder":
      return { ...base, folderId: selection.folderId };
    case "starred":
      return { ...base, starredOnly: true };
  }
}

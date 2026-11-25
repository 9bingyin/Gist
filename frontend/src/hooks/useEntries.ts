import { useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  type QueryClient,
} from "@tanstack/react-query";
import {
  listEntries,
  getEntry,
  updateEntryReadStatus,
  updateManyEntryReadStatus,
  updateEntryStarred,
  markAllAsRead,
  getUnreadCounts,
  getStarredCount,
} from "@/api";
import { countLoadedEntries } from "@/lib/entry-pagination";
import type {
  Entry,
  EntryListParams,
  MarkAllReadParams,
  StarredCountResponse,
} from "@/types/api";

interface InfiniteEntriesData {
  pages: { entries: Entry[]; hasMore: boolean }[];
}

function entriesQueryKey(params: EntryListParams) {
  return ["entries", params] as const;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function findEntryInCaches(
  queryClient: QueryClient,
  id: string,
): Entry | undefined {
  const cached = queryClient.getQueryData<Entry>(["entry", id]);
  if (cached) return cached;

  const queries = queryClient.getQueriesData<InfiniteEntriesData>({
    queryKey: ["entries"],
  });
  for (const [, data] of queries) {
    if (!data) continue;
    for (const page of data.pages) {
      const found = page.entries.find((e) => e.id === id);
      if (found) return found;
    }
  }
  return undefined;
}

function applyEntryUpdatesToListCache(
  queryClient: QueryClient,
  updates: Map<string, Partial<Entry>>,
): void {
  queryClient.setQueriesData<InfiniteEntriesData>(
    { queryKey: ["entries"] },
    (old) => {
      if (!old) return old;
      let changed = false;
      const pages = old.pages.map((page) => {
        let pageChanged = false;
        const entries = page.entries.map((entry) => {
          const patch = updates.get(entry.id);
          if (!patch) return entry;
          pageChanged = true;
          return { ...entry, ...patch };
        });
        if (!pageChanged) return page;
        changed = true;
        return { ...page, entries };
      });
      return changed ? { ...old, pages } : old;
    },
  );
}

export function useEntriesInfinite(params: Omit<EntryListParams, "offset">) {
  const pageSize = params.limit ?? 50;

  return useInfiniteQuery({
    queryKey: entriesQueryKey({ ...params, limit: pageSize }),
    queryFn: ({ pageParam = 0 }) =>
      listEntries({ ...params, limit: pageSize, offset: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return countLoadedEntries(allPages);
    },
    initialPageParam: 0,
  });
}

export function useEntry(id: string | null) {
  return useQuery({
    queryKey: ["entry", id],
    queryFn: () => getEntry(id!),
    enabled: id !== null,
  });
}

export function useUnreadCounts() {
  return useQuery({
    queryKey: ["unreadCounts"],
    queryFn: getUnreadCounts,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

interface MarkAsReadOptions {
  id: string;
  read: boolean;
  /** Skip invalidating entries query (for lightbox to avoid list refresh during viewing) */
  skipInvalidate?: boolean;
}

interface MarkManyAsReadOptions {
  ids: string[];
  read: boolean;
  skipInvalidate?: boolean;
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, read }: MarkAsReadOptions) =>
      updateEntryReadStatus(id, read),

    onMutate: async ({ id, read }) => {
      await queryClient.cancelQueries({ queryKey: ["entry", id] });
      await queryClient.cancelQueries({ queryKey: ["entries"] });

      const existing = findEntryInCaches(queryClient, id);
      const previousRead = existing?.read;

      queryClient.setQueryData<Entry>(["entry", id], (old) =>
        old ? { ...old, read } : old,
      );
      applyEntryUpdatesToListCache(queryClient, new Map([[id, { read }]]));

      return { previousRead };
    },

    onSuccess: (_, { skipInvalidate }) => {
      queryClient.invalidateQueries({ queryKey: ["unreadCounts"] });
      if (!skipInvalidate) {
        queryClient.invalidateQueries({ queryKey: ["entries"] });
      }
    },

    onError: (_, { id }, context) => {
      // Roll back only this specific entry so concurrent successful mutations are preserved
      if (context?.previousRead !== undefined) {
        const read = context.previousRead;
        queryClient.setQueryData<Entry>(["entry", id], (old) =>
          old ? { ...old, read } : old,
        );
        applyEntryUpdatesToListCache(queryClient, new Map([[id, { read }]]));
      } else {
        queryClient.invalidateQueries({ queryKey: ["entry", id] });
        queryClient.invalidateQueries({ queryKey: ["entries"] });
      }
    },
  });
}

export function useMarkManyAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, read }: MarkManyAsReadOptions) => {
      const uniqueIds = uniqueStrings(ids);
      if (uniqueIds.length === 0) return;
      await updateManyEntryReadStatus(uniqueIds, read);
    },

    onMutate: async ({ ids, read }) => {
      const uniqueIds = uniqueStrings(ids);
      await Promise.all(
        uniqueIds.map((id) =>
          queryClient.cancelQueries({ queryKey: ["entry", id] }),
        ),
      );
      await queryClient.cancelQueries({ queryKey: ["entries"] });

      const previousReadById = new Map<string, boolean>();
      const updates = new Map<string, Partial<Entry>>();

      for (const id of uniqueIds) {
        const existing = findEntryInCaches(queryClient, id);
        if (existing !== undefined) {
          previousReadById.set(id, existing.read);
        }
        updates.set(id, { read });
        queryClient.setQueryData<Entry>(["entry", id], (old) =>
          old ? { ...old, read } : old,
        );
      }

      applyEntryUpdatesToListCache(queryClient, updates);

      return { previousReadById };
    },

    onSuccess: (_, { skipInvalidate }) => {
      queryClient.invalidateQueries({ queryKey: ["unreadCounts"] });
      if (!skipInvalidate) {
        queryClient.invalidateQueries({ queryKey: ["entries"] });
      }
    },

    onError: (_, { ids }, context) => {
      // Roll back only this batch's IDs without clobbering concurrent mutations
      const uniqueIds = uniqueStrings(ids);
      const rollbackUpdates = new Map<string, Partial<Entry>>();

      for (const id of uniqueIds) {
        const previousRead = context?.previousReadById.get(id);
        if (previousRead !== undefined) {
          rollbackUpdates.set(id, { read: previousRead });
          queryClient.setQueryData<Entry>(["entry", id], (old) =>
            old ? { ...old, read: previousRead } : old,
          );
        }
      }

      if (rollbackUpdates.size > 0) {
        applyEntryUpdatesToListCache(queryClient, rollbackUpdates);
      } else {
        queryClient.invalidateQueries({ queryKey: ["entries"] });
      }
    },
  });
}

/** Remove specific entries from unreadOnly list cache (for delayed removal) */
export function useRemoveFromUnreadList() {
  const queryClient = useQueryClient();

  return useCallback(
    (idsToRemove: Set<string>) => {
      const queries = queryClient.getQueriesData<InfiniteEntriesData>({
        queryKey: ["entries"],
      });

      for (const [queryKey, data] of queries) {
        const params = queryKey[1] as EntryListParams | undefined;
        if (!params?.unreadOnly || !data) continue;

        const updatedData = {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            entries: page.entries.filter((entry) => !idsToRemove.has(entry.id)),
          })),
        };

        queryClient.setQueryData(queryKey, updatedData);
      }
    },
    [queryClient],
  );
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: MarkAllReadParams) => markAllAsRead(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["entry"] });
      queryClient.invalidateQueries({ queryKey: ["unreadCounts"] });
    },
  });
}

export function useStarredCount() {
  return useQuery({
    queryKey: ["starredCount"],
    queryFn: getStarredCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMarkAsStarred() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      updateEntryStarred(id, starred),

    onMutate: async ({ id, starred }) => {
      await queryClient.cancelQueries({ queryKey: ["entry", id] });
      await queryClient.cancelQueries({ queryKey: ["entries"] });
      await queryClient.cancelQueries({ queryKey: ["starredCount"] });

      const existing = findEntryInCaches(queryClient, id);
      const previousStarred = existing?.starred;
      const previousStarredCount =
        queryClient.getQueryData<StarredCountResponse>(["starredCount"]);

      queryClient.setQueryData<Entry>(["entry", id], (old) => {
        if (old) return { ...old, starred };
        return existing ? { ...existing, starred } : old;
      });
      applyEntryUpdatesToListCache(queryClient, new Map([[id, { starred }]]));

      if (previousStarred !== undefined && previousStarred !== starred) {
        queryClient.setQueryData<StarredCountResponse>(
          ["starredCount"],
          (old) =>
            old ? { count: Math.max(0, old.count + (starred ? 1 : -1)) } : old,
        );
      }

      return { previousStarred, previousStarredCount };
    },

    onError: (_, { id }, context) => {
      if (context?.previousStarred !== undefined) {
        const starred = context.previousStarred;
        queryClient.setQueryData<Entry>(["entry", id], (old) =>
          old ? { ...old, starred } : old,
        );
        applyEntryUpdatesToListCache(queryClient, new Map([[id, { starred }]]));
      }
      if (context?.previousStarredCount !== undefined) {
        queryClient.setQueryData(
          ["starredCount"],
          context.previousStarredCount,
        );
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["starredCount"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}

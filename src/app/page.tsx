"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { Layout } from "react-resizable-panels";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ArticleList } from "@/components/layout/article-list";
import { ArticleDetail } from "@/components/layout/article-detail";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Feed, Article, Folder, ContentType } from "@/lib/types";
import { useTranslation } from "react-i18next";

const LAYOUT_STORAGE_KEY = "rss-reader-layout";

export default function Home() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Refs to track current selection for async operations
  const selectedFeedIdRef = useRef(selectedFeedId);
  const selectedFolderIdRef = useRef(selectedFolderId);
  selectedFeedIdRef.current = selectedFeedId;
  selectedFolderIdRef.current = selectedFolderId;

  // Request version tracking for fetchArticles to handle race conditions
  const fetchArticlesVersionRef = useRef(0);
  const fetchArticlesAbortRef = useRef<AbortController | null>(null);

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [defaultLayout, setDefaultLayout] = useState<Layout | undefined>(
    undefined,
  );
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [selectedContentType, setSelectedContentType] =
    useState<ContentType>("article");
  const [isStarredView, setIsStarredView] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        setDefaultLayout(JSON.parse(saved));
      } catch {}
    }
    setLayoutLoaded(true);
  }, []);

  // Fetch settings (extracted for reuse)
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const settings = await res.json();
      setAutoTranslate(settings.aiAutoTranslate === "true");
      setTargetLanguage(settings.aiLanguage);
      setAiEnabled(settings.aiEnabled !== "false");
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
  }, []);

  // Initial settings load
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const onLayoutChange = useCallback((layout: Layout) => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  }, []);

  const fetchFeeds = useCallback(async () => {
    const res = await fetch("/api/feeds");
    const data = await res.json();
    setFeeds(data);
  }, []);

  const fetchFolders = useCallback(async () => {
    const res = await fetch("/api/folders");
    const data = await res.json();
    setFolders(data);
  }, []);

  const fetchArticles = useCallback(
    async (
      options: {
        feedId?: string | null;
        folderId?: string | null;
        type?: ContentType;
        starred?: boolean;
      } = {},
    ) => {
      // Abort previous request
      fetchArticlesAbortRef.current?.abort();
      const controller = new AbortController();
      fetchArticlesAbortRef.current = controller;

      // Increment version to track this request
      const currentVersion = ++fetchArticlesVersionRef.current;

      // Don't clear articles immediately - keep showing old data until new data arrives
      // This prevents "no articles" flash during fast folder switching

      setIsFetching(true);
      try {
        let url = "/api/articles";
        const params = new URLSearchParams();
        if (options.starred) {
          params.append("starred", "true");
        } else {
          if (options.feedId) params.append("feedId", options.feedId);
          if (options.folderId) params.append("folderId", options.folderId);
          if (options.type) params.append("type", options.type);
        }

        if (params.toString()) {
          url += `?${params.toString()}`;
        }

        const res = await fetch(url, {
          signal: controller.signal,
          priority: "high",
        } as RequestInit);
        if (!res.ok) {
          throw new Error("Failed to fetch articles");
        }
        const data: Article[] = await res.json();

        // Ignore stale response
        if (currentVersion !== fetchArticlesVersionRef.current) {
          return;
        }

        // Set articles directly (translation state is now managed in global store)
        setArticles(data);

        setSelectedArticle((prev) => {
          if (!prev) return prev;
          const updated = data.find((a) => a.id === prev.id);
          return updated || prev;
        });
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch articles:", error);
      } finally {
        if (currentVersion === fetchArticlesVersionRef.current) {
          setIsFetching(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    fetchFeeds();
    fetchFolders();
    fetchArticles({ type: selectedContentType });
  }, [fetchFeeds, fetchFolders, fetchArticles, selectedContentType]);

  const handleSelectFeed = (feedId: string | null) => {
    setArticles([]);
    setIsStarredView(false);
    setSelectedFeedId(feedId);
    setSelectedFolderId(null);
    fetchArticles({ feedId, type: selectedContentType });
  };

  const handleSelectFolder = (folderId: string) => {
    setArticles([]);
    setIsStarredView(false);
    setSelectedFolderId(folderId);
    setSelectedFeedId(null);
    fetchArticles({ folderId, type: selectedContentType });
  };

  const handleSelectStarred = useCallback(() => {
    setArticles([]);
    setIsStarredView(true);
    setSelectedFeedId(null);
    setSelectedFolderId(null);
    fetchArticles({ starred: true });
  }, [fetchArticles]);

  const handleToggleStar = useCallback(
    async (article: Article) => {
      const newStarred = !article.isStarred;

      // Optimistic update
      setArticles((prev) =>
        prev.map((a) =>
          a.id === article.id ? { ...a, isStarred: newStarred } : a
        )
      );

      if (selectedArticle?.id === article.id) {
        setSelectedArticle((prev) =>
          prev ? { ...prev, isStarred: newStarred } : null
        );
      }

      try {
        await fetch(`/api/articles/${article.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isStarred: newStarred }),
        });
      } catch (error) {
        // Rollback on error
        setArticles((prev) =>
          prev.map((a) =>
            a.id === article.id ? { ...a, isStarred: article.isStarred } : a
          )
        );
        if (selectedArticle?.id === article.id) {
          setSelectedArticle((prev) =>
            prev ? { ...prev, isStarred: article.isStarred } : null
          );
        }
        console.error("Failed to toggle star:", error);
      }
    },
    [selectedArticle]
  );

  const handleAddFeed = async (url: string, type: ContentType) => {
    const res = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, type }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to add feed");
    }

    await fetchFeeds();
    await fetchArticles({
      feedId: selectedFeedId,
      folderId: selectedFolderId,
      type: selectedContentType,
    });
  };

  const handleRefreshFeed = async (feedId: string) => {
    await fetch(`/api/feeds/${feedId}/refresh`, { method: "POST" });
    await fetchFeeds();
    await fetchArticles({
      feedId: selectedFeedId,
      folderId: selectedFolderId,
      type: selectedContentType,
    });
  };

  const handleRefreshAllFeeds = async () => {
    const CONCURRENCY = 5;

    // Batch concurrent refresh
    for (let i = 0; i < feeds.length; i += CONCURRENCY) {
      const batch = feeds.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map((feed) =>
          fetch(`/api/feeds/${feed.id}/refresh`, { method: "POST" })
        )
      );
    }

    await fetchFeeds();
    await fetchArticles({
      feedId: selectedFeedId,
      folderId: selectedFolderId,
      type: selectedContentType,
    });
  };

  const handleDeleteFeed = async (feedId: string) => {
    await fetch(`/api/feeds?id=${feedId}`, { method: "DELETE" });
    if (selectedFeedId === feedId) {
      handleSelectFeed(null);
    } else {
      await fetchFeeds();
      await fetchArticles({
        feedId: selectedFeedId,
        folderId: selectedFolderId,
        type: selectedContentType,
      });
    }
  };

  const handleSelectArticle = async (article: Article) => {
    setSelectedArticle(article);
    if (isMobile) {
      setMobileView("detail");
    }
    if (!article.isRead) {
      await fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
      setArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, isRead: true } : a)),
      );
      await fetchFeeds();
    }
  };

  const handleBackToList = useCallback(() => {
    setMobileView("list");
  }, []);

  const handleRefresh = async () => {
    // Capture current selection at start
    const feedIdAtStart = selectedFeedId;
    const folderIdAtStart = selectedFolderId;

    setIsRefreshing(true);
    try {
      if (feedIdAtStart) {
        // Refresh single feed
        await fetch(`/api/feeds/${feedIdAtStart}/refresh`, { method: "POST" });
      } else if (folderIdAtStart) {
        // Refresh only feeds in the selected folder (concurrent)
        const folderFeeds = feeds.filter(
          (f) => f.folderId === folderIdAtStart,
        );
        await Promise.allSettled(
          folderFeeds.map((feed) =>
            fetch(`/api/feeds/${feed.id}/refresh`, { method: "POST" }),
          ),
        );
      } else {
        // Refresh all feeds using handleRefreshAllFeeds
        await handleRefreshAllFeeds();
        return; // handleRefreshAllFeeds handles fetchFeeds/fetchArticles
      }
      await fetchFeeds();

      // Only load articles if user hasn't navigated away
      if (
        selectedFeedIdRef.current === feedIdAtStart &&
        selectedFolderIdRef.current === folderIdAtStart
      ) {
        await fetchArticles({
          feedId: feedIdAtStart,
          folderId: folderIdAtStart,
          type: selectedContentType,
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddFolder = async (name: string, type: ContentType) => {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create folder");
    }

    await fetchFolders();
  };

  const handleDeleteFolder = async (folderId: string) => {
    await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
    if (selectedFolderId === folderId) {
      handleSelectFeed(null); // Reset to 'All'
    }
    await fetchFolders();
    await fetchFeeds();
  };

  const handleRenameFolder = async (folderId: string, name: string) => {
    await fetch(`/api/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await fetchFolders();
  };

  const handleMoveFeedToFolder = async (
    feedId: string,
    folderId: string | null,
  ) => {
    await fetch(`/api/feeds/${feedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    await fetchFeeds();
    await fetchFolders();
    await fetchArticles({
      feedId: selectedFeedId,
      folderId: selectedFolderId,
      type: selectedContentType,
    });
  };

  const handleChangeFeedType = async (feedId: string, type: ContentType) => {
    await fetch(`/api/feeds/${feedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    await fetchFeeds();
    await fetchArticles({
      feedId: selectedFeedId,
      folderId: selectedFolderId,
      type: selectedContentType,
    });
  };

  const handleChangeFolderType = async (folderId: string, type: ContentType) => {
    await fetch(`/api/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    await fetchFolders();
    await fetchFeeds();
    await fetchArticles({
      feedId: selectedFeedId,
      folderId: selectedFolderId,
      type: selectedContentType,
    });
  };

  const handleDataChange = async () => {
    await fetchFeeds();
    await fetchFolders();
    await fetchArticles({
      feedId: selectedFeedId,
      folderId: selectedFolderId,
      type: selectedContentType,
    });
    await fetchSettings();
  };

  const handleArticleUpdate = useCallback((updatedArticle: Article) => {
    setSelectedArticle((prev) => {
      if (!prev || prev.id !== updatedArticle.id) return updatedArticle;
      return { ...prev, ...updatedArticle };
    });

    setArticles((prev) =>
      prev.map((a) =>
        a.id === updatedArticle.id ? { ...a, ...updatedArticle } : a
      )
    );
  }, []);


  const handleMarkAllRead = async () => {
    // Capture current unread article IDs to prevent race conditions
    const articleIdsToMark = articles.filter((a) => !a.isRead).map((a) => a.id);

    if (articleIdsToMark.length === 0) return;

    // Optimistic update
    setArticles((prev) =>
      prev.map((a) =>
        articleIdsToMark.includes(a.id) ? { ...a, isRead: true } : a,
      ),
    );

    await fetch("/api/articles/mark-all-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedId: selectedFeedId,
        folderId: selectedFolderId,
        articleIds: articleIdsToMark,
      }),
    });
    await fetchFeeds();
  };

  const { t } = useTranslation();

  const listTitle = useMemo(() => {
    if (isStarredView) {
      return t("nav.starred");
    }
    if (selectedFeedId) {
      const feed = feeds.find((f) => f.id === selectedFeedId);
      return feed ? feed.title : t("nav.articles");
    }
    if (selectedFolderId) {
      const folder = folders.find((f) => f.id === selectedFolderId);
      return folder ? folder.name : t("nav.articles");
    }
    const titleMap: Record<ContentType, string> = {
      article: t("nav.all_articles"),
      picture: t("nav.all_pictures"),
      notification: t("nav.all_notifications"),
    };
    return titleMap[selectedContentType];
  }, [isStarredView, selectedFeedId, selectedFolderId, feeds, folders, selectedContentType, t]);

  if (!layoutLoaded) {
    return <div className="h-screen" />;
  }

  // Sidebar component (shared between mobile and desktop)
  const sidebarContent = (
    <AppSidebar
      feeds={feeds}
      folders={folders}
      selectedFeedId={selectedFeedId}
      selectedFolderId={selectedFolderId}
      selectedContentType={selectedContentType}
      isStarredView={isStarredView}
      onSelectFeed={(feedId) => {
        handleSelectFeed(feedId);
        setSidebarOpen(false);
      }}
      onSelectFolder={(folderId) => {
        handleSelectFolder(folderId);
        setSidebarOpen(false);
      }}
      onSelectContentType={(type) => {
        setArticles([]);
        setIsStarredView(false);
        setSelectedContentType(type);
        setSelectedFeedId(null);
        setSelectedFolderId(null);
        fetchArticles({ type });
      }}
      onSelectStarred={() => {
        handleSelectStarred();
        setSidebarOpen(false);
      }}
      onAddFeed={handleAddFeed}
      onRefreshFeed={handleRefreshFeed}
      onDeleteFeed={handleDeleteFeed}
      onRefreshAllFeeds={handleRefreshAllFeeds}
      onAddFolder={handleAddFolder}
      onDeleteFolder={handleDeleteFolder}
      onRenameFolder={handleRenameFolder}
      onMoveFeedToFolder={handleMoveFeedToFolder}
      onChangeFeedType={handleChangeFeedType}
      onChangeFolderType={handleChangeFolderType}
      onDataChange={handleDataChange}
    />
  );

  // Mobile layout
  if (isMobile) {
    return (
      <div className="h-screen flex flex-col">
        {mobileView === "list" ? (
          <>
            <ArticleList
              title={listTitle}
              articles={articles}
              selectedArticleId={selectedArticle?.id ?? null}
              onSelectArticle={handleSelectArticle}
              onRefresh={handleRefresh}
              onMarkAllRead={handleMarkAllRead}
              loading={isRefreshing || isFetching}
              autoTranslate={autoTranslate}
              targetLanguage={targetLanguage}
              aiEnabled={aiEnabled}
              showMenuButton
              onMenuClick={() => setSidebarOpen(true)}
            />
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetContent side="left" className="w-[280px] p-0" hideCloseButton>
                {sidebarContent}
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <ArticleDetail
            article={selectedArticle}
            onArticleUpdate={handleArticleUpdate}
            onToggleStar={handleToggleStar}
            autoTranslate={autoTranslate}
            targetLanguage={targetLanguage}
            aiEnabled={aiEnabled}
            onBack={handleBackToList}
          />
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <ResizablePanelGroup
      id={LAYOUT_STORAGE_KEY}
      orientation="horizontal"
      className="h-screen"
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
    >
      <ResizablePanel
        id="sidebar"
        defaultSize="17%"
        minSize="10%"
        maxSize="30%"
      >
        {sidebarContent}
      </ResizablePanel>

      <ResizableHandle />
      <ResizablePanel
        id="article-list"
        defaultSize="23%"
        minSize="10%"
        maxSize="40%"
      >
        <ArticleList
          title={listTitle}
          articles={articles}
          selectedArticleId={selectedArticle?.id ?? null}
          onSelectArticle={handleSelectArticle}
          onRefresh={handleRefresh}
          onMarkAllRead={handleMarkAllRead}
          loading={isRefreshing || isFetching}
          autoTranslate={autoTranslate}
          targetLanguage={targetLanguage}
          aiEnabled={aiEnabled}
        />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="article-detail" defaultSize="60%" minSize="30%">
        <ArticleDetail
          article={selectedArticle}
          onArticleUpdate={handleArticleUpdate}
          onToggleStar={handleToggleStar}
          autoTranslate={autoTranslate}
          targetLanguage={targetLanguage}
          aiEnabled={aiEnabled}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

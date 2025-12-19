"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { Layout } from "react-resizable-panels";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ArticleList } from "@/components/layout/article-list";
import { ArticleDetail } from "@/components/layout/article-detail";
import type { Feed, Article, Folder } from "@/lib/types";
import { useTranslation } from "react-i18next";

const LAYOUT_STORAGE_KEY = "rss-reader-layout";

export default function Home() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [defaultLayout, setDefaultLayout] = useState<Layout | undefined>(
    undefined,
  );
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("Chinese");

  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        setDefaultLayout(JSON.parse(saved));
      } catch {}
    }
    setLayoutLoaded(true);
  }, []);

  // Fetch auto-translate setting and target language
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        const settings = await res.json();
        setAutoTranslate(settings.aiAutoTranslate === "true");
        setTargetLanguage(settings.aiLanguage || "Chinese");
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      }
    };
    fetchSettings();
  }, []);

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
      options: { feedId?: string | null; folderId?: string | null } = {},
    ) => {
      setLoading(true);
      let url = "/api/articles";
      const params = new URLSearchParams();
      if (options.feedId) params.append("feedId", options.feedId);
      if (options.folderId) params.append("folderId", options.folderId);

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url);
      const data: Article[] = await res.json();

      // Preserve translation fields from existing articles
      setArticles((prev) => {
        const translationMap = new Map<
          string,
          { translatedTitle?: string; translatedSummary?: string }
        >();
        for (const article of prev) {
          if (article.translatedTitle || article.translatedSummary) {
            translationMap.set(article.id, {
              translatedTitle: article.translatedTitle,
              translatedSummary: article.translatedSummary,
            });
          }
        }

        return data.map((article) => {
          const translation = translationMap.get(article.id);
          if (translation) {
            return { ...article, ...translation };
          }
          return article;
        });
      });

      setSelectedArticle((prev) => {
        if (!prev) return prev;
        const updated = data.find((a) => a.id === prev.id);
        if (updated && prev.translatedTitle) {
          return {
            ...updated,
            translatedTitle: prev.translatedTitle,
            translatedSummary: prev.translatedSummary,
          };
        }
        return updated || prev;
      });
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    fetchFeeds();
    fetchFolders();
    fetchArticles();
  }, [fetchFeeds, fetchFolders, fetchArticles]);

  const handleSelectFeed = (feedId: string | null) => {
    setSelectedFeedId(feedId);
    setSelectedFolderId(null);
    fetchArticles({ feedId });
  };

  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    setSelectedFeedId(null);
    fetchArticles({ folderId });
  };

  const handleAddFeed = async (url: string) => {
    const res = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to add feed");
    }

    await fetchFeeds();
    await fetchArticles({ feedId: selectedFeedId, folderId: selectedFolderId });
  };

  const handleRefreshFeed = async (feedId: string) => {
    await fetch(`/api/feeds/${feedId}/refresh`, { method: "POST" });
    await fetchFeeds();
    await fetchArticles({ feedId: selectedFeedId, folderId: selectedFolderId });
  };

  const handleRefreshAllFeeds = async () => {
    for (const feed of feeds) {
      await fetch(`/api/feeds/${feed.id}/refresh`, { method: "POST" });
    }
    await fetchFeeds();
    await fetchArticles({ feedId: selectedFeedId, folderId: selectedFolderId });
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
      });
    }
  };

  const handleSelectArticle = async (article: Article) => {
    setSelectedArticle(article);
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

  const handleRefresh = async () => {
    setLoading(true);
    try {
      if (selectedFeedId) {
        // Refresh single feed
        await fetch(`/api/feeds/${selectedFeedId}/refresh`, { method: "POST" });
      } else if (selectedFolderId) {
        // Refresh only feeds in the selected folder
        const folderFeeds = feeds.filter(
          (f) => f.folderId === selectedFolderId,
        );
        for (const feed of folderFeeds) {
          await fetch(`/api/feeds/${feed.id}/refresh`, { method: "POST" });
        }
      } else {
        // Refresh all feeds
        for (const feed of feeds) {
          await fetch(`/api/feeds/${feed.id}/refresh`, { method: "POST" });
        }
      }
      await fetchFeeds();
      await fetchArticles({
        feedId: selectedFeedId,
        folderId: selectedFolderId,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddFolder = async (name: string) => {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
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
  };

  const handleDataChange = async () => {
    await fetchFeeds();
    await fetchFolders();
    await fetchArticles({ feedId: selectedFeedId, folderId: selectedFolderId });
  };

  const handleArticleUpdate = useCallback((updatedArticle: Article) => {
    setSelectedArticle(updatedArticle);
    setArticles((prev) =>
      prev.map((a) => (a.id === updatedArticle.id ? updatedArticle : a)),
    );
  }, []);

  const handleUpdateArticles = useCallback((updatedArticles: Article[]) => {
    setArticles(updatedArticles);
    // Also update selected article if it was translated
    setSelectedArticle((prev) => {
      if (!prev) return prev;
      const updated = updatedArticles.find((a) => a.id === prev.id);
      return updated || prev;
    });
  }, []);

  const handleMarkAllRead = async () => {
    await fetch("/api/articles/mark-all-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedId: selectedFeedId }), // TODO: Update backend to support folderId
    });
    await fetchArticles({ feedId: selectedFeedId, folderId: selectedFolderId });
    await fetchFeeds();
  };

  const { t } = useTranslation();

  const listTitle = useMemo(() => {
    if (selectedFeedId) {
      const feed = feeds.find((f) => f.id === selectedFeedId);
      return feed ? feed.title : t("nav.articles");
    }
    if (selectedFolderId) {
      const folder = folders.find((f) => f.id === selectedFolderId);
      return folder ? folder.name : t("nav.articles");
    }
    return t("nav.all_articles");
  }, [selectedFeedId, selectedFolderId, feeds, folders, t]);

  if (!layoutLoaded) {
    return <div className="h-screen" />;
  }

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
        <AppSidebar
          feeds={feeds}
          folders={folders}
          selectedFeedId={selectedFeedId}
          selectedFolderId={selectedFolderId}
          onSelectFeed={handleSelectFeed}
          onSelectFolder={handleSelectFolder}
          onAddFeed={handleAddFeed}
          onRefreshFeed={handleRefreshFeed}
          onDeleteFeed={handleDeleteFeed}
          onRefreshAllFeeds={handleRefreshAllFeeds}
          onAddFolder={handleAddFolder}
          onDeleteFolder={handleDeleteFolder}
          onRenameFolder={handleRenameFolder}
          onMoveFeedToFolder={handleMoveFeedToFolder}
          onDataChange={handleDataChange}
        />
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
          onUpdateArticles={handleUpdateArticles}
          loading={loading}
          autoTranslate={autoTranslate}
          targetLanguage={targetLanguage}
        />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="article-detail" defaultSize="60%" minSize="30%">
        <ArticleDetail
          article={selectedArticle}
          onArticleUpdate={handleArticleUpdate}
          autoTranslate={autoTranslate}
          targetLanguage={targetLanguage}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

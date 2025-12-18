"use client";

import { useState, useEffect, useCallback } from "react";
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

const LAYOUT_STORAGE_KEY = "rss-reader-layout";

export default function Home() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [defaultLayout, setDefaultLayout] = useState<Layout | undefined>(undefined);
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        setDefaultLayout(JSON.parse(saved));
      } catch {}
    }
    setLayoutLoaded(true);
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

  const fetchArticles = useCallback(async (feedId?: string | null) => {
    setLoading(true);
    const url = feedId ? `/api/articles?feedId=${feedId}` : "/api/articles";
    const res = await fetch(url);
    const data: Article[] = await res.json();
    setArticles(data);
    // Update selectedArticle if it exists in the new data
    setSelectedArticle((prev) => {
      if (!prev) return prev;
      const updated = data.find((a) => a.id === prev.id);
      return updated || prev;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFeeds();
    fetchFolders();
    fetchArticles();
  }, [fetchFeeds, fetchFolders, fetchArticles]);

  useEffect(() => {
    fetchArticles(selectedFeedId);
  }, [selectedFeedId, fetchArticles]);

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
    await fetchArticles(selectedFeedId);
  };

  const handleRefreshFeed = async (feedId: string) => {
    await fetch(`/api/feeds/${feedId}/refresh`, { method: "POST" });
    await fetchFeeds();
    await fetchArticles(selectedFeedId);
  };

  const handleRefreshAllFeeds = async () => {
    for (const feed of feeds) {
      await fetch(`/api/feeds/${feed.id}/refresh`, { method: "POST" });
    }
    await fetchFeeds();
    await fetchArticles(selectedFeedId);
  };

  const handleDeleteFeed = async (feedId: string) => {
    await fetch(`/api/feeds?id=${feedId}`, { method: "DELETE" });
    if (selectedFeedId === feedId) {
      setSelectedFeedId(null);
    }
    await fetchFeeds();
    await fetchArticles(selectedFeedId === feedId ? null : selectedFeedId);
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
        prev.map((a) => (a.id === article.id ? { ...a, isRead: true } : a))
      );
      await fetchFeeds();
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      if (selectedFeedId) {
        // Refresh selected feed
        await fetch(`/api/feeds/${selectedFeedId}/refresh`, { method: "POST" });
      } else {
        // Refresh all feeds
        for (const feed of feeds) {
          await fetch(`/api/feeds/${feed.id}/refresh`, { method: "POST" });
        }
      }
      await fetchFeeds();
      await fetchArticles(selectedFeedId);
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

  const handleMoveFeedToFolder = async (feedId: string, folderId: string | null) => {
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
    await fetchArticles(selectedFeedId);
  };

  const handleArticleUpdate = useCallback((updatedArticle: Article) => {
    setSelectedArticle(updatedArticle);
    setArticles((prev) =>
      prev.map((a) => (a.id === updatedArticle.id ? updatedArticle : a))
    );
  }, []);

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
      <ResizablePanel id="sidebar" defaultSize="17%" minSize="10%" maxSize="30%">
        <AppSidebar
          feeds={feeds}
          folders={folders}
          selectedFeedId={selectedFeedId}
          onSelectFeed={setSelectedFeedId}
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
      <ResizablePanel id="article-list" defaultSize="23%" minSize="10%" maxSize="40%">
        <ArticleList
          articles={articles}
          selectedArticleId={selectedArticle?.id ?? null}
          onSelectArticle={handleSelectArticle}
          onRefresh={handleRefresh}
          loading={loading}
        />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="article-detail" defaultSize="60%" minSize="30%">
        <ArticleDetail
          article={selectedArticle}
          onArticleUpdate={handleArticleUpdate}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

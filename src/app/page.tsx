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
import type { Feed, Article } from "@/lib/types";

const LAYOUT_STORAGE_KEY = "rss-reader-layout";

export default function Home() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
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

  const fetchArticles = useCallback(async (feedId?: string | null) => {
    setLoading(true);
    const url = feedId ? `/api/articles?feedId=${feedId}` : "/api/articles";
    const res = await fetch(url);
    const data = await res.json();
    setArticles(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFeeds();
    fetchArticles();
  }, [fetchFeeds, fetchArticles]);

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

  const handleRefresh = () => {
    fetchArticles(selectedFeedId);
  };

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
          selectedFeedId={selectedFeedId}
          onSelectFeed={setSelectedFeedId}
          onAddFeed={handleAddFeed}
          onRefreshFeed={handleRefreshFeed}
          onDeleteFeed={handleDeleteFeed}
          onRefreshAllFeeds={handleRefreshAllFeeds}
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
        <ArticleDetail article={selectedArticle} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

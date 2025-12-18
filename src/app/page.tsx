"use client";

import { useState, useEffect, useCallback } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ArticleList } from "@/components/layout/article-list";
import { ArticleDetail } from "@/components/layout/article-detail";
import type { Feed, Article } from "@/lib/types";

export default function Home() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <SidebarProvider>
      <AppSidebar
        feeds={feeds}
        selectedFeedId={selectedFeedId}
        onSelectFeed={setSelectedFeedId}
        onAddFeed={handleAddFeed}
        onRefreshFeed={handleRefreshFeed}
        onDeleteFeed={handleDeleteFeed}
        onRefreshAllFeeds={handleRefreshAllFeeds}
      />
      <SidebarInset className="flex h-screen flex-row">
        <div className="w-[400px] shrink-0 overflow-hidden">
          <ArticleList
            articles={articles}
            selectedArticleId={selectedArticle?.id ?? null}
            onSelectArticle={handleSelectArticle}
            onRefresh={handleRefresh}
            loading={loading}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <ArticleDetail article={selectedArticle} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

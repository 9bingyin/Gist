import { Suspense, lazy, useCallback, useMemo, useEffect } from "react";
import { Router, useLocation, useSearch, Redirect } from "wouter";
import { useTranslation } from "react-i18next";
import { ThreeColumnLayout } from "@/components/layout/three-column-layout";
import { Sheet } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/sidebar";
import { AddFeedPage } from "@/components/add-feed";
import { EntryList } from "@/components/entry-list";
import { PictureMasonry, Lightbox } from "@/components/picture-masonry";
import { ScrollToTopZone } from "@/components/layout/ScrollToTopZone";
import { ImagePreview } from "@/components/ui/image-preview";
import { LoginPage, RegisterPage, NetworkErrorPage } from "@/components/auth";
import { UpdateNotice } from "@/components/update-notice";
import {
  EntryContentEmpty,
  EntryContentSkeleton,
} from "@/components/entry-content/EntryContentPlaceholders";
import { useSelection, selectionToParams } from "@/hooks/useSelection";
import { useMarkAllAsRead, useEntry } from "@/hooks/useEntries";
import { useMobileLayout } from "@/hooks/useMobileLayout";
import { useMobileDocumentScrollMode } from "@/hooks/useMobileDocumentScrollMode";
import { useAuth } from "@/hooks/useAuth";
import { useFeeds } from "@/hooks/useFeeds";
import { useFolders } from "@/hooks/useFolders";
import { useAppearanceSettings } from "@/hooks/useAppearanceSettings";
import { useTitle, buildTitle } from "@/hooks/useTitle";
import {
  useUISettingKey,
  useUISettingActions,
  hasSidebarVisibilitySetting,
  setUISetting,
} from "@/hooks/useUISettings";
import { useRefreshStatus } from "@/hooks/useRefreshStatus";
import {
  useAuthStore,
  registerSessionResetListener,
} from "@/stores/auth-store";
import { entryListScrollPositions } from "@/components/entry-list/scroll-key";
import { isAddFeedPath } from "@/lib/router";
import {
  createFeedsMap,
  createFoldersMap,
  getVisibleContentTypes,
  isContentType,
} from "@/lib/content-types";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/types/api";

registerSessionResetListener(() => {
  entryListScrollPositions.clear();
});

const LazyEntryContent = lazy(async () => {
  const module = await import("@/components/entry-content");
  return { default: module.EntryContent };
});

function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full items-center justify-center overflow-x-clip bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{t("entry.loading")}</p>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const [location, navigate] = useLocation();
  const search = useSearch();

  const {
    selection,
    selectAll,
    selectFeed,
    selectFolder,
    selectStarred,
    selectedEntryId,
    selectEntry,
    unreadOnly,
    toggleUnreadOnly,
    contentType,
  } = useSelection();

  const handleClearEntry = useCallback(() => {
    selectEntry(null);
  }, [selectEntry]);

  const {
    isMobile,
    isTablet,
    mobileView,
    sidebarOpen,
    setSidebarOpen,
    showList,
    openSidebar,
    closeSidebar,
  } = useMobileLayout({
    selectedEntryId,
    onClearEntry: handleClearEntry,
  });

  const { mutate: markAllAsRead } = useMarkAllAsRead();

  // Derive add-feed content type directly from URL query so refresh preserves it
  const addFeedContentType = useMemo<ContentType>(() => {
    const param = new URLSearchParams(search).get("type");
    return isContentType(param) ? param : contentType;
  }, [search, contentType]);

  // Poll refresh status and auto-invalidate entries when refresh completes
  useRefreshStatus();

  const sidebarVisible = useUISettingKey("sidebarVisible");
  const { toggleSidebarVisible } = useUISettingActions();

  useEffect(() => {
    if (isTablet && !hasSidebarVisibilitySetting()) {
      setUISetting("sidebarVisible", false);
    }
  }, [isTablet]);

  const showSidebar = useMemo(() => {
    if (isMobile) return false;
    if (isTablet) return sidebarVisible;
    return true;
  }, [isMobile, isTablet, sidebarVisible]);

  const { t } = useTranslation();
  const { data: feeds = [] } = useFeeds();
  const { data: folders = [] } = useFolders();
  const { data: appearanceSettings, isLoading: isAppearanceLoading } =
    useAppearanceSettings();
  const { data: entry } = useEntry(selectedEntryId);

  const feedsMap = useMemo(() => createFeedsMap(feeds), [feeds]);
  const foldersMap = useMemo(() => createFoldersMap(folders), [folders]);

  const title = buildTitle({
    selection,
    contentType,
    entryTitle: entry?.title,
    feedsMap,
    foldersMap,
    t,
  });

  useTitle(title);

  const handleSelectFeed = useCallback(
    (feedId: string) => {
      closeSidebar();
      selectFeed(feedId, { replace: true });
    },
    [selectFeed, closeSidebar],
  );

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      closeSidebar();
      selectFolder(folderId, { replace: true });
    },
    [selectFolder, closeSidebar],
  );

  const handleSelectStarred = useCallback(() => {
    closeSidebar();
    selectStarred({ replace: true });
  }, [selectStarred, closeSidebar]);

  const handleAddClick = useCallback(
    (ct: ContentType) => {
      closeSidebar();
      navigate(`/add-feed?type=${ct}`, { replace: true });
    },
    [navigate, closeSidebar],
  );

  const handleCloseAddFeed = useCallback(() => {
    navigate(`/all?type=${contentType}`, { replace: true });
  }, [navigate, contentType]);

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead(selectionToParams(selection, contentType));
  }, [markAllAsRead, selection, contentType]);

  const handleSelectAll = useCallback(
    (type?: ContentType) => {
      closeSidebar();
      selectAll(type, { replace: true });
    },
    [selectAll, closeSidebar],
  );

  const visibleContentTypes = useMemo(
    () => getVisibleContentTypes(appearanceSettings),
    [appearanceSettings],
  );

  useEffect(() => {
    if (!visibleContentTypes.includes(contentType)) {
      const next = visibleContentTypes[0] ?? "article";
      selectAll(next, { replace: true });
    }
  }, [visibleContentTypes, contentType, selectAll]);

  const usesMobileDocumentScroll = isMobile && !isAddFeedPath(location);
  useMobileDocumentScrollMode({
    enabled: usesMobileDocumentScroll,
    locked: usesMobileDocumentScroll && mobileView === "detail",
  });

  const entryContent = selectedEntryId ? (
    <Suspense fallback={<EntryContentSkeleton />}>
      <LazyEntryContent key={selectedEntryId} entryId={selectedEntryId} />
    </Suspense>
  ) : (
    <EntryContentEmpty message={t("entry.select_article")} />
  );

  const mobileEntryContent = selectedEntryId ? (
    <Suspense fallback={<EntryContentSkeleton />}>
      <LazyEntryContent
        key={selectedEntryId}
        entryId={selectedEntryId}
        isMobile
        onBack={showList}
      />
    </Suspense>
  ) : (
    <EntryContentEmpty message={t("entry.select_article")} />
  );

  if (location === "/") {
    if (isAppearanceLoading) {
      return <div className="h-full bg-background" />;
    }
    const defaultType = visibleContentTypes[0] ?? "article";
    return <Redirect to={`/all?type=${defaultType}`} replace />;
  }

  if (isAppearanceLoading) {
    return <div className="h-full bg-background" />;
  }

  const sidebarContent = (
    <Sidebar
      onAddClick={handleAddClick}
      selection={selection}
      onSelectFeed={handleSelectFeed}
      onSelectFolder={handleSelectFolder}
      onSelectStarred={handleSelectStarred}
      onSelectAll={handleSelectAll}
      contentType={contentType}
      appearanceSettings={appearanceSettings}
    />
  );

  if (isMobile) {
    let mobileContent: React.ReactNode;

    if (isAddFeedPath(location)) {
      mobileContent = (
        <div className="h-full safe-area-top">
          <AddFeedPage
            onClose={handleCloseAddFeed}
            contentType={addFeedContentType}
          />
        </div>
      );
    } else if (contentType === "picture") {
      mobileContent = (
        <div className="min-h-[var(--app-dvh)] bg-background">
          <PictureMasonry
            selection={selection}
            contentType={contentType}
            unreadOnly={unreadOnly}
            onToggleUnreadOnly={toggleUnreadOnly}
            onMarkAllRead={handleMarkAllRead}
            isMobile
            onMenuClick={openSidebar}
          />
        </div>
      );
    } else {
      mobileContent = (
        <div className="mobile-reading-stack relative min-h-[var(--app-dvh)] w-screen max-w-full bg-background">
          <section
            className={cn(
              "mobile-list-page min-h-[var(--app-dvh)] bg-background",
              mobileView === "detail" && "pointer-events-none select-none",
            )}
            aria-hidden={mobileView === "detail"}
            inert={mobileView === "detail" ? true : undefined}
          >
            <EntryList
              selection={selection}
              selectedEntryId={selectedEntryId}
              onSelectEntry={selectEntry}
              onMarkAllRead={handleMarkAllRead}
              unreadOnly={unreadOnly}
              onToggleUnreadOnly={toggleUnreadOnly}
              contentType={contentType}
              isMobile
              isActive={mobileView === "list"}
              onMenuClick={openSidebar}
            />
          </section>
          <section
            className={cn(
              "mobile-detail-page fixed inset-0 z-30 h-[var(--app-dvh)] overflow-hidden bg-background transition-transform duration-300 ease-out",
              mobileView === "detail"
                ? "translate-x-0"
                : "pointer-events-none translate-x-full",
            )}
            aria-hidden={mobileView !== "detail"}
            inert={mobileView !== "detail" ? true : undefined}
          >
            {mobileEntryContent}
          </section>
        </div>
      );
    }

    return (
      <>
        {mobileContent}
        <ScrollToTopZone />
        {contentType === "picture" && <Lightbox />}
        {contentType !== "picture" && <ImagePreview />}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          {sidebarContent}
        </Sheet>
      </>
    );
  }

  if (isAddFeedPath(location)) {
    return (
      <ThreeColumnLayout
        sidebar={sidebarContent}
        list={null}
        content={
          <AddFeedPage
            onClose={handleCloseAddFeed}
            contentType={addFeedContentType}
          />
        }
        hideList
        showSidebar={showSidebar}
      />
    );
  }

  if (contentType === "picture") {
    return (
      <>
        <ThreeColumnLayout
          sidebar={sidebarContent}
          list={null}
          content={
            <PictureMasonry
              selection={selection}
              contentType={contentType}
              unreadOnly={unreadOnly}
              onToggleUnreadOnly={toggleUnreadOnly}
              onMarkAllRead={handleMarkAllRead}
              isTablet={isTablet}
              onToggleSidebar={toggleSidebarVisible}
              sidebarVisible={sidebarVisible}
            />
          }
          hideList
          showSidebar={showSidebar}
        />
        <Lightbox />
      </>
    );
  }

  return (
    <>
      <ThreeColumnLayout
        sidebar={sidebarContent}
        list={
          <EntryList
            selection={selection}
            selectedEntryId={selectedEntryId}
            onSelectEntry={selectEntry}
            onMarkAllRead={handleMarkAllRead}
            unreadOnly={unreadOnly}
            onToggleUnreadOnly={toggleUnreadOnly}
            contentType={contentType}
            isTablet={isTablet}
            onToggleSidebar={toggleSidebarVisible}
            sidebarVisible={sidebarVisible}
          />
        }
        content={entryContent}
        showSidebar={showSidebar}
      />
      <ImagePreview />
    </>
  );
}

function AppContent() {
  const [location, navigate] = useLocation();
  const {
    isLoading,
    isAuthenticated,
    needsRegistration,
    needsLogin,
    isNetworkError,
    error,
    shouldRedirectToRoot,
    login,
    register,
    retry,
    clearError,
    consumeRootRedirect,
  } = useAuth();

  // Trigger auth initialization once at the application root
  useEffect(() => {
    void useAuthStore.getState().initialize();
  }, []);

  useEffect(() => {
    if (!shouldRedirectToRoot) {
      return;
    }
    if (location !== "/") {
      navigate("/", { replace: true });
    }
    consumeRootRedirect();
  }, [shouldRedirectToRoot, location, navigate, consumeRootRedirect]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isNetworkError) {
    return <NetworkErrorPage onRetry={retry} />;
  }

  if (needsRegistration) {
    return (
      <RegisterPage
        onRegister={register}
        error={error}
        onClearError={clearError}
      />
    );
  }

  if (needsLogin) {
    return (
      <LoginPage onLogin={login} error={error} onClearError={clearError} />
    );
  }

  if (isAuthenticated) {
    return <AuthenticatedApp />;
  }

  return <LoadingScreen />;
}

function App() {
  return (
    <div className="app-shell">
      <TooltipProvider delayDuration={300}>
        <Router>
          <AppContent />
          <UpdateNotice />
        </Router>
      </TooltipProvider>
    </div>
  );
}

export default App;

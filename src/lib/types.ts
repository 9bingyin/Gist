export type ContentType = "article" | "picture" | "notification";

export interface Folder {
  id: string;
  name: string;
  type: ContentType;
  createdAt: string;
  updatedAt: string;
  _count: {
    feeds: number;
  };
  feeds?: Feed[];
  unreadCount?: number;
}

export interface Feed {
  id: string;
  title: string;
  url: string;
  siteUrl: string | null;
  description: string | null;
  imageUrl: string | null;
  type: ContentType;
  createdAt: string;
  updatedAt: string;
  folderId: string | null;
  _count: {
    articles: number;
  };
}

export interface Article {
  id: string;
  title: string;
  link: string;
  content: string | null;
  readabilityContent: string | null;
  summary: string | null;
  imageUrl: string | null;
  pubDate: string | null;
  isRead: boolean;
  feedId: string;
  createdAt: string;
  feed: {
    id: string;
    title: string;
    imageUrl: string | null;
  };
  // Temporary fields for translation (not persisted)
  translatedTitle?: string;
  translatedSummary?: string;
  translationDisabled?: boolean; // User manually disabled translation for this article
}

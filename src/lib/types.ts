export interface Folder {
  id: string;
  name: string;
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
}

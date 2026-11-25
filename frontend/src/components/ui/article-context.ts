import { createContext } from "react";

export interface ImagePreviewContextValue {
  images: string[];
  openPreview: (src: string) => void;
}

export const ImagePreviewContext =
  createContext<ImagePreviewContextValue | null>(null);

export const ArticleLinkContext = createContext<string | undefined>(undefined);

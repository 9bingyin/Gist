"use client";

import { createContext, useContext, useCallback } from "react";
import { imageQueue, type FetchResult } from "@/lib/image-queue";

interface ImageQueueContextValue {
  fetchImage: (url: string) => FetchResult;
  clearQueue: () => void;
}

const ImageQueueContext = createContext<ImageQueueContextValue | null>(null);

export function ImageAbortProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const fetchImage = useCallback((url: string) => {
    return imageQueue.fetch(url);
  }, []);

  const clearQueue = useCallback(() => {
    imageQueue.clear();
  }, []);

  return (
    <ImageQueueContext.Provider value={{ fetchImage, clearQueue }}>
      {children}
    </ImageQueueContext.Provider>
  );
}

export function useImageAbort() {
  const context = useContext(ImageQueueContext);
  if (!context) {
    throw new Error("useImageAbort must be used within ImageAbortProvider");
  }
  return {
    abortAll: context.clearQueue,
    fetchImage: context.fetchImage,
  };
}

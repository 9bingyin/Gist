"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useImageAbort } from "@/lib/contexts/image-abort-context";
import { ImageQueueCancelledError } from "@/lib/image-queue";

interface LazyImageProps {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
}

export function LazyImage({
  src,
  alt = "",
  className,
  containerClassName,
}: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const { fetchImage } = useImageAbort();
  const blobUrlRef = useRef<string | null>(null);

  // IntersectionObserver to detect if element is in viewport
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { rootMargin: "50px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Only fetch when in view
  useEffect(() => {
    if (!isInView || isLoaded) return;

    let isMounted = true;
    const { promise, cancel } = fetchImage(src);

    promise
      .then((blob) => {
        if (isMounted) {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
          setIsLoaded(true);
        }
      })
      .catch((error) => {
        if (error instanceof ImageQueueCancelledError) {
          return;
        }
        if (isMounted) {
          setIsError(true);
        }
      });

    return () => {
      isMounted = false;
      cancel();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [isInView, isLoaded, src, fetchImage]);

  if (isError) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          containerClassName
        )}
      >
        <svg
          className="h-6 w-6 opacity-50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden bg-muted", containerClassName)}
    >
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-muted" />
      )}
      {blobUrl && (
        <img
          src={blobUrl}
          alt={alt}
          className={cn(
            "transition-opacity duration-200",
            isLoaded ? "opacity-100" : "opacity-0",
            className
          )}
        />
      )}
    </div>
  );
}

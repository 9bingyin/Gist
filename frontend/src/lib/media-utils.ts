/**
 * Check if a thumbnail URL is from a video
 * Twitter video thumbnails contain 'video_thumb' in the URL
 * e.g., ext_tw_video_thumb, amplify_video_thumb
 */
export function isVideoThumbnail(url?: string): boolean {
  if (!url) return false
  return url.includes('video_thumb')
}

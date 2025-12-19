// App metadata
export const APP_NAME = "Gist";
export const APP_VERSION = "1.0.0";
export const APP_REPO = "https://github.com/9bingyin/Gist";

// Gist User-Agent (identifies as Gist RSS reader)
export const GIST_USER_AGENT = `Mozilla/5.0 (compatible; ${APP_NAME}/${APP_VERSION}; +${APP_REPO})`;

// Chrome User-Agent (for sites that block non-browser UA)
export const CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Default User-Agent for RSS fetching
export const DEFAULT_USER_AGENT = GIST_USER_AGENT;

// Default settings
export const DEFAULT_REFRESH_INTERVAL = 15; // minutes

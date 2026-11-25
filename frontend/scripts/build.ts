import { cp, rename, rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";
import { generateSW, type RuntimeCaching } from "workbox-build";

const outdir = "./dist";
await rm(outdir, { recursive: true, force: true });
await cp("./public", outdir, { recursive: true });

const { outputs } = await Bun.build({
  entrypoints: ["./index.html"],
  outdir,
  target: "browser",
  publicPath: "/",
  naming: {
    entry: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    asset: "[name].[ext]",
  },
  splitting: true,
  minify: true,
  plugins: [tailwind],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.PUBLIC_API_URL": JSON.stringify(
      process.env.PUBLIC_API_URL ?? process.env.VITE_API_URL ?? "",
    ),
  },
});

const html = outputs.find((output) => output.path.endsWith(".html"));
if (!html) throw new Error("Bun did not emit index.html");
await rename(html.path, `${outdir}/index.html`);

function cacheFirst(
  urlPattern: RegExp,
  cacheName: string,
  maxEntries: number,
  maxAgeDays: number,
): RuntimeCaching {
  return {
    urlPattern,
    handler: "CacheFirst",
    options: {
      cacheName,
      expiration: { maxEntries, maxAgeSeconds: maxAgeDays * 24 * 60 * 60 },
      cacheableResponse: { statuses: [0, 200] },
    },
  };
}

const { count, size, warnings } = await generateSW({
  globDirectory: outdir,
  swDest: `${outdir}/sw.js`,
  globPatterns: [
    "index.html",
    "manifest.webmanifest",
    "assets/**/*",
    "*.{png,svg,ico}",
  ],
  dontCacheBustURLsMatching: /^assets\//,
  navigateFallback: "index.html",
  navigateFallbackDenylist: [/^\/api/],
  cleanupOutdatedCaches: true,
  // Opt out of Chrome's ServiceWorkerAutoPreload regression (#466790291).
  importScripts: ["sw-preload-fix.js"],
  runtimeCaching: [
    cacheFirst(
      /^https:\/\/fonts\.googleapis\.com\//i,
      "google-fonts-cache",
      10,
      365,
    ),
    cacheFirst(
      /^https:\/\/fonts\.gstatic\.com\//i,
      "gstatic-fonts-cache",
      10,
      365,
    ),
    cacheFirst(/\/icons\/[^/]+$/, "feed-icons-cache", 500, 30),
    cacheFirst(/\/api\/proxy\/image\/.+/, "proxied-images-cache", 1000, 7),
  ],
});

if (warnings.length > 0) throw new Error(warnings.join("\n"));
console.log(`Built ${outdir} with ${count} precached files (${size} bytes)`);
